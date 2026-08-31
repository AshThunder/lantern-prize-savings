// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/interfaces/IERC7984ERC20Wrapper.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/// @title Lantern — Confidential Prize Savings (PoolTogether-style)
/// @notice No-loss prize vault: encrypted shares, FHE-weighted draws, principal always withdrawable.
/// @dev Recreates PoolTogether V5 user/vault/prize-pool surface under FHE constraints:
///      deposit / mint / withdraw / redeem, sponsor/contribute yield, two prize tiers,
///      chance delegation, permissionless award + claim-for, keeper draw steps.
contract ConfidentialPrizePool is ZamaEthereumConfig, Ownable2Step, IERC7984Receiver {
    using SafeERC20 for IERC20;

    uint8 public constant MAX_DEPOSITORS = 32;
    uint8 public constant MAX_STEP = 8;
    uint8 public constant NUMBER_OF_TIERS = 2;
    uint16 public constant GRAND_TIER_BPS = 7500;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    bytes1 public constant DATA_DEPOSIT = 0x01;

    IERC7984 public immutable prizeToken;
    IERC20 public immutable asset;
    IERC7984ERC20Wrapper public immutable wrapper;

    uint32 public drawPeriodSeconds;
    uint32 public minHoldSeconds;
    uint64 public prizeLiquidity;
    uint64 public lastDrawPrize;
    uint64 public lastGrandPrize;
    uint64 public lastDailyPrize;
    uint256 public lastAwardedDrawId;
    uint256 public openDrawId;
    uint256 public lastDrawClose;

    bool public drawing;
    uint256 public scanIndex;
    euint64 private _totalShares;
    euint64 private _ticketGrand;
    euint64 private _ticketDaily;
    euint64 private _cursor;
    ebool private _foundGrand;
    ebool private _foundDaily;
    euint64 private _grandPrizeEnc;
    euint64 private _dailyPrizeEnc;

    address[] private _depositors;
    mapping(address depositor => uint256 oneBasedIndex) private _depositorIndex;
    mapping(address account => euint64 shares) private _shares;
    mapping(address account => euint64 winnings) private _winnings;
    mapping(address account => address delegatee) private _delegatee;
    mapping(address account => uint256 lastActionAt) public lastActionAt;

    address public claimer;

    error DrawInProgress();
    error DrawNotInProgress();
    error DrawIntervalNotElapsed();
    error DrawScanIncomplete();
    error NoDepositors();
    error NoPrizeLiquidity();
    error MaxDepositors();
    error InvalidToken();
    error InvalidStep();
    error NotClaimer();
    error ZeroAddress();
    error AmountZero();

    event Deposited(address indexed from, address indexed receiver);
    event Withdrawn(address indexed owner, address indexed receiver);
    event YieldContributed(address indexed from, uint64 amount);
    event Delegated(address indexed user, address indexed to);
    event DrawStarted(uint256 indexed drawId, uint64 grandPrize, uint64 dailyPrize, uint256 depositorCount);
    event DrawStepped(uint256 indexed drawId, uint256 scanIndex, uint256 depositorCount);
    event DrawAwarded(uint256 indexed drawId);
    event Claimed(address indexed winner, address indexed receiver);
    event ClaimerSet(address indexed claimer);
    event DrawPeriodSet(uint32 period);
    event MinHoldSet(uint32 seconds_);

    modifier notDrawing() {
        if (drawing) revert DrawInProgress();
        _;
    }

    constructor(
        address owner_,
        IERC7984 prizeToken_,
        IERC20 asset_,
        IERC7984ERC20Wrapper wrapper_,
        uint32 drawPeriodSeconds_
    ) Ownable(owner_) {
        if (address(prizeToken_) == address(0) || address(asset_) == address(0)) revert ZeroAddress();
        prizeToken = prizeToken_;
        asset = asset_;
        wrapper = wrapper_;
        drawPeriodSeconds = drawPeriodSeconds_;
        claimer = owner_;
        openDrawId = 1;
        lastDrawClose = block.timestamp;
    }

    // -------------------------------------------------------------------------
    // IERC7984Receiver — confidential deposit (PoolTogether deposit)
    // -------------------------------------------------------------------------

    /// @notice Credit encrypted shares when cUSDT arrives via `confidentialTransferAndCall`.
    /// @dev `data[0] == 0x01` deposits for `from`. Any other payload rejects so the token refunds.
    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata data
    ) external returns (ebool) {
        if (msg.sender != address(prizeToken) || drawing || data.length == 0 || data[0] != DATA_DEPOSIT) {
            return _reject(msg.sender);
        }
        address receiver = from;
        if (data.length >= 21) {
            receiver = address(uint160(bytes20(data[1:21])));
        }
        _addDepositor(receiver);
        _creditShares(receiver, amount);
        lastActionAt[receiver] = block.timestamp;
        emit Deposited(from, receiver);
        return _accept(msg.sender);
    }

    // -------------------------------------------------------------------------
    // ERC-4626-style vault surface (1:1 shares; yield never inflates share price)
    // -------------------------------------------------------------------------

    function decimals() external view returns (uint8) {
        return prizeToken.decimals();
    }

    /// @notice 1:1 because yield is diverted to prizes, matching PoolTogether.
    function convertToShares(uint256 assets_) external pure returns (uint256) {
        return assets_;
    }

    function convertToAssets(uint256 shares_) external pure returns (uint256) {
        return shares_;
    }

    function previewDeposit(uint256 assets_) external pure returns (uint256) {
        return assets_;
    }

    function previewMint(uint256 shares_) external pure returns (uint256) {
        return shares_;
    }

    function previewWithdraw(uint256 assets_) external pure returns (uint256) {
        return assets_;
    }

    function previewRedeem(uint256 shares_) external pure returns (uint256) {
        return shares_;
    }

    function maxDeposit(address) external view returns (uint256) {
        if (drawing || _depositors.length >= MAX_DEPOSITORS) return 0;
        return type(uint64).max;
    }

    function maxMint(address account) external view returns (uint256) {
        return this.maxDeposit(account);
    }

    /// @dev Upper bound only; actual max is the caller's encrypted shares (decrypt client-side).
    function maxWithdraw(address) external view returns (uint256) {
        if (drawing) return 0;
        return type(uint64).max;
    }

    function maxRedeem(address account) external view returns (uint256) {
        return this.maxWithdraw(account);
    }

    function totalAssets() external view returns (euint64) {
        return _totalShares;
    }

    function totalSupply() external view returns (euint64) {
        return _totalShares;
    }

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _shares[account];
    }

    function confidentialWinningsOf(address account) external view returns (euint64) {
        return _winnings[account];
    }

    /// @notice Withdraw an encrypted asset amount of principal. No loss.
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof, address receiver) external notDrawing {
        _withdrawAmount(FHE.fromExternal(encryptedAmount, inputProof), msg.sender, receiver, false);
    }

    /// @notice Redeem (burn) an encrypted share amount for assets. 1:1 with withdraw.
    function redeem(externalEuint64 encryptedAmount, bytes calldata inputProof, address receiver) external notDrawing {
        _withdrawAmount(FHE.fromExternal(encryptedAmount, inputProof), msg.sender, receiver, false);
    }

    /// @notice Exit the vault: send the caller's full encrypted share balance and drop them from the draw set.
    function redeemAll(address receiver) external notDrawing {
        euint64 allShares = _zeroIfEmpty(_shares[msg.sender]);
        _withdrawAmount(allShares, msg.sender, receiver, true);
    }

    function withdrawAll(address receiver) external notDrawing {
        euint64 allShares = _zeroIfEmpty(_shares[msg.sender]);
        _withdrawAmount(allShares, msg.sender, receiver, true);
    }

    // -------------------------------------------------------------------------
    // Yield — mock harvest / PoolTogether contributePrizeTokens + sponsor
    // -------------------------------------------------------------------------

    /// @notice Donate underlying ERC-20 as prize liquidity (no shares). Pool wraps to cUSDT.
    /// @dev Production: replace with ERC-4626 harvest + Zama confidential vault batcher.
    function sponsor(uint64 amount) public notDrawing {
        if (amount == 0) revert AmountZero();
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).safeIncreaseAllowance(address(wrapper), amount);
        wrapper.wrap(address(this), amount);
        prizeLiquidity += amount;
        emit YieldContributed(msg.sender, amount);
    }

    /// @notice PoolTogether name for contributing prize tokens after yield liquidation.
    function contributePrizeTokens(uint64 amount) external {
        sponsor(amount);
    }

    /// @notice Mock yield harvest. Same as sponsor; documented as the liquidator entrypoint.
    function liquidateYield(uint64 amount) external {
        sponsor(amount);
    }

    function availableYield() external view returns (uint64) {
        return prizeLiquidity;
    }

    // -------------------------------------------------------------------------
    // Chance delegation (PoolTogether TwabController.delegate)
    // -------------------------------------------------------------------------

    function delegate(address to) external {
        if (to == address(0)) revert ZeroAddress();
        _delegatee[msg.sender] = to;
        emit Delegated(msg.sender, to);
    }

    function delegateOf(address user) external view returns (address) {
        return _chanceOwner(user);
    }

    // -------------------------------------------------------------------------
    // Draws — PoolTogether award + FHE-weighted selection
    // -------------------------------------------------------------------------

    function canStartDraw() public view returns (bool) {
        return
            !drawing &&
            prizeLiquidity > 0 &&
            _depositors.length > 0 &&
            block.timestamp >= lastDrawClose + drawPeriodSeconds;
    }

    /// @notice Permissionless award after the draw period (PoolTogether draw manager).
    function startDraw() external {
        if (!canStartDraw()) revert DrawIntervalNotElapsed();
        _beginDraw();
    }

    /// @notice Owner override so a demo/video can award immediately.
    function forceDraw() external onlyOwner {
        if (drawing) revert DrawInProgress();
        _beginDraw();
    }

    /// @notice Continue the encrypted cumulative scan. Anyone can keep. `n` capped at 8 for HCU.
    function stepDraw(uint8 n) external {
        if (!drawing) revert DrawNotInProgress();
        if (n == 0 || n > MAX_STEP) revert InvalidStep();

        uint256 len = _depositors.length;
        uint256 end = scanIndex + n;
        if (end > len) end = len;

        for (uint256 i = scanIndex; i < end; ++i) {
            _scanOne(_depositors[i]);
        }
        scanIndex = end;
        emit DrawStepped(openDrawId, scanIndex, len);
    }

    /// @notice Close the draw after every depositor has been scanned. Does not reveal the winner.
    function finalizeDraw() public {
        if (!drawing) revert DrawNotInProgress();
        if (scanIndex < _depositors.length) revert DrawScanIncomplete();

        drawing = false;
        lastAwardedDrawId = openDrawId;
        lastDrawClose = block.timestamp;
        emit DrawAwarded(openDrawId);
        openDrawId += 1;
    }

    function getTierPrizeCount(uint8) external pure returns (uint32) {
        return 1;
    }

    function numberOfTiers() external pure returns (uint8) {
        return NUMBER_OF_TIERS;
    }

    function getOpenDrawId() external view returns (uint256) {
        return openDrawId;
    }

    function getLastAwardedDrawId() external view returns (uint256) {
        return lastAwardedDrawId;
    }

    function depositorCount() external view returns (uint256) {
        return _depositors.length;
    }

    function depositorAt(uint256 index) external view returns (address) {
        return _depositors[index];
    }

    function remainingScan() external view returns (uint256) {
        if (!drawing) return 0;
        uint256 len = _depositors.length;
        return scanIndex >= len ? 0 : len - scanIndex;
    }

    // -------------------------------------------------------------------------
    // Claims — self-claim and claim-for (PoolTogether claimer)
    // -------------------------------------------------------------------------

    function claim() external {
        _claimTo(msg.sender, msg.sender);
    }

    function claimTo(address receiver) external {
        _claimTo(msg.sender, receiver);
    }

    /// @notice Claim on behalf of a winner. Prize always goes to the winner (or their receiver).
    function claimFor(address winner) external {
        if (msg.sender != claimer && msg.sender != owner() && msg.sender != winner) revert NotClaimer();
        _claimTo(winner, winner);
    }

    function setClaimer(address claimer_) external onlyOwner {
        if (claimer_ == address(0)) revert ZeroAddress();
        claimer = claimer_;
        emit ClaimerSet(claimer_);
    }

    function setDrawPeriodSeconds(uint32 period) external onlyOwner {
        drawPeriodSeconds = period;
        emit DrawPeriodSet(period);
    }

    function setMinHoldSeconds(uint32 seconds_) external onlyOwner {
        minHoldSeconds = seconds_;
        emit MinHoldSet(seconds_);
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    function _beginDraw() internal {
        if (_depositors.length == 0) revert NoDepositors();
        if (prizeLiquidity == 0) revert NoPrizeLiquidity();
        if (!FHE.isInitialized(_totalShares)) revert NoDepositors();

        uint64 grand = uint64((uint256(prizeLiquidity) * GRAND_TIER_BPS) / BPS_DENOMINATOR);
        uint64 daily = prizeLiquidity - grand;
        lastDrawPrize = prizeLiquidity;
        lastGrandPrize = grand;
        lastDailyPrize = daily;
        prizeLiquidity = 0;

        euint64 r0 = FHE.randEuint64();
        euint64 r1 = FHE.randEuint64();
        _ticketGrand = _mapTicket(r0, _totalShares);
        _ticketDaily = _mapTicket(r1, _totalShares);
        _cursor = FHE.asEuint64(0);
        _foundGrand = FHE.asEbool(false);
        _foundDaily = FHE.asEbool(false);
        _grandPrizeEnc = FHE.asEuint64(grand);
        _dailyPrizeEnc = FHE.asEuint64(daily);

        FHE.allowThis(_ticketGrand);
        FHE.allowThis(_ticketDaily);
        FHE.allowThis(_cursor);
        FHE.allowThis(_foundGrand);
        FHE.allowThis(_foundDaily);
        FHE.allowThis(_grandPrizeEnc);
        FHE.allowThis(_dailyPrizeEnc);

        drawing = true;
        scanIndex = 0;
        emit DrawStarted(openDrawId, grand, daily, _depositors.length);
    }

    /// @dev ticket ≈ Uniform[0, totalShares) via (rand64 * total) >> 64 in 128-bit space.
    function _mapTicket(euint64 randVal, euint64 total) internal returns (euint64) {
        euint128 prod = FHE.mul(FHE.asEuint128(randVal), FHE.asEuint128(total));
        return FHE.asEuint64(FHE.shr(prod, uint8(64)));
    }

    function _scanOne(address user) internal {
        euint64 share = _zeroIfEmpty(_shares[user]);
        bool eligible = minHoldSeconds == 0 || lastActionAt[user] + minHoldSeconds <= block.timestamp;
        if (!eligible) {
            share = FHE.asEuint64(0);
        }
        euint64 nextCursor = FHE.add(_cursor, share);
        ebool hitGrand = FHE.and(FHE.lt(_ticketGrand, nextCursor), FHE.not(_foundGrand));
        ebool hitDaily = FHE.and(FHE.lt(_ticketDaily, nextCursor), FHE.not(_foundDaily));
        _foundGrand = FHE.or(_foundGrand, hitGrand);
        _foundDaily = FHE.or(_foundDaily, hitDaily);
        _cursor = nextCursor;
        FHE.allowThis(_foundGrand);
        FHE.allowThis(_foundDaily);
        FHE.allowThis(_cursor);

        address winner = _chanceOwner(user);
        euint64 bonus = FHE.add(
            FHE.select(hitGrand, _grandPrizeEnc, FHE.asEuint64(0)),
            FHE.select(hitDaily, _dailyPrizeEnc, FHE.asEuint64(0))
        );
        euint64 current = _zeroIfEmpty(_winnings[winner]);
        euint64 updated = FHE.add(current, bonus);
        _winnings[winner] = updated;
        FHE.allowThis(updated);
        FHE.allow(updated, winner);
    }

    function _withdrawAmount(euint64 requested, address owner_, address receiver, bool exitVault) internal {
        if (receiver == address(0)) revert ZeroAddress();
        euint64 current = _zeroIfEmpty(_shares[owner_]);
        euint64 taken = requested;
        if (!exitVault) {
            ebool can = FHE.le(requested, current);
            taken = FHE.select(can, requested, FHE.asEuint64(0));
        }
        euint64 remaining = FHE.sub(current, taken);
        _shares[owner_] = remaining;
        _totalShares = FHE.sub(_zeroIfEmpty(_totalShares), taken);
        FHE.allowThis(remaining);
        FHE.allow(remaining, owner_);
        FHE.allowThis(_totalShares);

        FHE.allowTransient(taken, address(prizeToken));
        prizeToken.confidentialTransfer(receiver, taken);
        lastActionAt[owner_] = block.timestamp;
        if (exitVault) _removeDepositor(owner_);
        emit Withdrawn(owner_, receiver);
    }

    function _claimTo(address winner, address receiver) internal {
        euint64 amount = _zeroIfEmpty(_winnings[winner]);
        _winnings[winner] = FHE.asEuint64(0);
        FHE.allowThis(_winnings[winner]);
        FHE.allow(_winnings[winner], winner);
        FHE.allowTransient(amount, address(prizeToken));
        prizeToken.confidentialTransfer(receiver, amount);
        emit Claimed(winner, receiver);
    }

    function _creditShares(address account, euint64 amount) internal {
        euint64 next = FHE.add(_zeroIfEmpty(_shares[account]), amount);
        _shares[account] = next;
        _totalShares = FHE.add(_zeroIfEmpty(_totalShares), amount);
        FHE.allowThis(next);
        FHE.allow(next, account);
        FHE.allowThis(_totalShares);
    }

    function _addDepositor(address user) internal {
        if (_depositorIndex[user] != 0) return;
        if (_depositors.length >= MAX_DEPOSITORS) revert MaxDepositors();
        _depositors.push(user);
        _depositorIndex[user] = _depositors.length;
        if (_delegatee[user] == address(0)) _delegatee[user] = user;
    }

    function _removeDepositor(address user) internal {
        uint256 index1 = _depositorIndex[user];
        if (index1 == 0) return;
        uint256 idx = index1 - 1;
        address last = _depositors[_depositors.length - 1];
        _depositors[idx] = last;
        _depositorIndex[last] = idx + 1;
        _depositors.pop();
        _depositorIndex[user] = 0;
    }

    function _chanceOwner(address user) internal view returns (address) {
        address to = _delegatee[user];
        return to == address(0) ? user : to;
    }

    function _zeroIfEmpty(euint64 value) internal returns (euint64) {
        if (FHE.isInitialized(value)) return value;
        return FHE.asEuint64(0);
    }

    function _accept(address token) internal returns (ebool) {
        ebool ok = FHE.asEbool(true);
        FHE.allowThis(ok);
        FHE.allowTransient(ok, token);
        return ok;
    }

    function _reject(address token) internal returns (ebool) {
        ebool no = FHE.asEbool(false);
        FHE.allowThis(no);
        FHE.allowTransient(no, token);
        return no;
    }
}
