// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/interfaces/IERC7984ERC20Wrapper.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";
import {IPrizeHooks, PrizeHooks} from "./interfaces/IPrizeHooks.sol";

/// @title Lantern — Confidential Prize Savings (PoolTogether-style)
/// @notice No-loss prize vault: encrypted shares, FHE-weighted draws, principal always withdrawable.
/// @dev Replica of PoolTogether V5 under FHE. Origins:
///      Design https://dev.pooltogether.com/protocol/design/
///      Prize Pool https://dev.pooltogether.com/protocol/design/prize-pool
///      Vaults https://dev.pooltogether.com/protocol/design/vaults
///      Claimer https://dev.pooltogether.com/protocol/design/prize-claimer
///      TWAB https://dev.pooltogether.com/protocol/design/twab-controller
///      Incentives https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives
contract ConfidentialPrizePool is ZamaEthereumConfig, Ownable2Step, ERC2771Context, IERC7984Receiver {
    using SafeERC20 for IERC20;

    uint8 public constant MAX_STEP = 8;
    uint8 public constant NUMBER_OF_TIERS = 2;
    uint16 public constant GRAND_TIER_BPS = 7500;
    uint16 public constant RESERVE_BPS = 1000;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant DRAW_OPEN = 0;
    uint8 public constant DRAW_CLOSED = 1;
    uint8 public constant DRAW_AWARDED = 2;
    uint8 public constant DRAW_FINALIZED = 3;
    bytes1 public constant DATA_DEPOSIT = 0x01;

    IERC7984 public immutable prizeToken;
    IERC20 public immutable asset;
    IERC7984ERC20Wrapper public immutable wrapper;

    uint32 public drawPeriodSeconds;
    uint32 public minHoldSeconds;
    uint64 public prizeLiquidity;
    uint64 public reserve;
    uint64 public keeperReward;
    uint256 public firstDrawStartsAt;
    uint64 public lastDrawPrize;
    uint64 public lastGrandPrize;
    uint64 public lastDailyPrize;
    uint256 public lastAwardedDrawId;
    uint256 public openDrawId;
    uint256 public lastDrawClose;

    bool public drawing;
    bool public twabSumming;
    uint256 public scanIndex;
    uint256 public drawStartedAt;
    bool public lastDrawUsedShares;
    uint32 public lastGlobalTwabTs;
    euint64 private _totalShares;
    euint64 private _twabCumulativeTotal;
    euint64 private _twabTotalSnap;
    euint64 private _grandPrizeEnc;
    euint64 private _dailyPrizeEnc;
    euint64 private _grandLeft;
    euint64 private _dailyLeft;
    euint64 private _eligibleTwabTotal;
    bool private _enforceMinHold;

    address[] private _depositors;
    mapping(address depositor => uint256 oneBasedIndex) private _depositorIndex;
    mapping(address account => euint64 shares) private _shares;
    mapping(address account => euint64 winnings) private _winnings;
    mapping(address account => address delegatee) private _delegatee;
    mapping(address account => uint256 lastActionAt) public lastActionAt;

    address public claimer;
    bytes32 public lastDrawEntropy;

    mapping(address account => PrizeHooks hooks) private _hooks;
    mapping(address account => address drawRecipient) private _drawRecipient;
    mapping(address account => euint64 twabCumulative) private _twabCumulative;
    mapping(address account => euint64 twabSnapshot) private _twabSnapshot;
    mapping(address account => euint64 drawWeight) private _drawWeight;
    mapping(address account => uint32 lastTwabTs) public lastTwabTimestamp;
    mapping(address account => uint256 snapDrawId) public userSnapDrawId;
    mapping(uint256 drawId => uint32 startedAt) public drawStartedAtOf;
    mapping(uint256 drawId => bool usedShares) public drawUsedShares;

    uint256 public twabCampaignCount;
    mapping(uint256 id => uint64 budget) public twabBudget;
    mapping(uint256 id => uint64 scale) public twabScale;
    mapping(uint256 id => uint32 start) public twabStart;
    mapping(uint256 id => uint32 end) public twabEnd;
    mapping(uint256 id => mapping(address account => bool claimed)) public twabClaimed;
    mapping(uint256 drawId => mapping(address account => bool settled)) public prizeSettled;

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
    error CampaignNotEnded();
    error AlreadyClaimed();
    error InvalidCampaign();

    event Deposited(address indexed from, address indexed receiver);
    event Withdrawn(address indexed owner, address indexed receiver);
    event YieldContributed(address indexed from, uint64 amount);
    event Delegated(address indexed user, address indexed to);
    event DrawStarted(uint256 indexed drawId, uint64 grandPrize, uint64 dailyPrize, uint256 depositorCount);
    event DrawStepped(uint256 indexed drawId, uint256 scanIndex, uint256 depositorCount);
    event PrizeAccrued(address indexed account, address indexed recipient);
    event DrawAwarded(uint256 indexed drawId);
    event Claimed(address indexed winner, address indexed receiver);
    event ClaimerSet(address indexed claimer);
    event DrawPeriodSet(uint32 period);
    event MinHoldSet(uint32 seconds_);
    event KeeperRewardSet(uint64 amount);
    event SetHooks(address indexed account, bool useBefore, bool useAfter, address implementation);
    event TwabCampaignCreated(uint256 indexed id, address indexed from, uint64 budget, uint32 duration, uint64 scale);
    event TwabRewardsClaimed(uint256 indexed id, address indexed account);
    event RecipientsSnapshotted(uint256 depositorCount);
    event KeeperRewarded(address indexed keeper, uint64 amount);
    event ReserveContributed(uint64 amount);

    modifier notDrawing() {
        if (drawing) revert DrawInProgress();
        _;
    }

    constructor(
        address owner_,
        IERC7984 prizeToken_,
        IERC20 asset_,
        IERC7984ERC20Wrapper wrapper_,
        uint32 drawPeriodSeconds_,
        address trustedForwarder_
    ) Ownable(owner_) ERC2771Context(trustedForwarder_) {
        if (address(prizeToken_) == address(0) || address(asset_) == address(0)) revert ZeroAddress();
        prizeToken = prizeToken_;
        asset = asset_;
        wrapper = wrapper_;
        drawPeriodSeconds = drawPeriodSeconds_;
        minHoldSeconds = drawPeriodSeconds_;
        firstDrawStartsAt = block.timestamp;
        keeperReward = 100_000; // 0.1 USDT (6 decimals) — Draw Manager analog
        claimer = owner_;
        openDrawId = 1;
        lastDrawClose = block.timestamp;
        lastGlobalTwabTs = uint32(block.timestamp);
    }

    // -------------------------------------------------------------------------
    // IERC7984Receiver — confidential deposit
    // Origin: https://dev.pooltogether.com/protocol/design/vaults
    // -------------------------------------------------------------------------

    /// @notice Credit encrypted shares when cUSDT arrives via `confidentialTransferAndCall`.
    /// @dev PoolTogether Prize Vault `deposit`. `data[0] == 0x01` deposits for `from`.
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
    // Origin: https://dev.pooltogether.com/protocol/design/vaults
    // -------------------------------------------------------------------------

    function decimals() external view returns (uint8) {
        return prizeToken.decimals();
    }

    /// @notice 1:1 because yield is diverted to prizes, matching PoolTogether Prize Vault.
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
        if (drawing) return 0;
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
        _withdrawAmount(FHE.fromExternal(encryptedAmount, inputProof), _msgSender(), receiver, false);
    }

    /// @notice Redeem (burn) an encrypted share amount for assets. 1:1 with withdraw.
    function redeem(externalEuint64 encryptedAmount, bytes calldata inputProof, address receiver) external notDrawing {
        _withdrawAmount(FHE.fromExternal(encryptedAmount, inputProof), _msgSender(), receiver, false);
    }

    /// @notice Exit the vault: send the caller's full encrypted share balance and drop them from the draw set.
    function redeemAll(address receiver) external notDrawing {
        address user = _msgSender();
        euint64 allShares = _zeroIfEmpty(_shares[user]);
        _withdrawAmount(allShares, user, receiver, true);
    }

    function withdrawAll(address receiver) external notDrawing {
        address user = _msgSender();
        euint64 allShares = _zeroIfEmpty(_shares[user]);
        _withdrawAmount(allShares, user, receiver, true);
    }

    // -------------------------------------------------------------------------
    // Yield — mock harvest / contributePrizeTokens + sponsor
    // Origin: https://dev.pooltogether.com/protocol/design/#liquidation
    // Reserve: https://dev.pooltogether.com/protocol/design/prize-pool#reserve
    // -------------------------------------------------------------------------

    /// @notice Donate underlying ERC-20 as prize liquidity (no shares). 10% stays unwrapped in `reserve`.
    /// @dev Production: replace with ERC-4626 harvest + TPDA liquidator + Zama confidential vault batcher.
    function sponsor(uint64 amount) public notDrawing {
        if (amount == 0) revert AmountZero();
        IERC20(asset).safeTransferFrom(_msgSender(), address(this), amount);
        uint64 toReserve = uint64((uint256(amount) * RESERVE_BPS) / BPS_DENOMINATOR);
        uint64 toPrize = amount - toReserve;
        if (toPrize > 0) {
            IERC20(asset).safeIncreaseAllowance(address(wrapper), toPrize);
            wrapper.wrap(address(this), toPrize);
            prizeLiquidity += toPrize;
        }
        if (toReserve > 0) {
            reserve += toReserve;
            emit ReserveContributed(toReserve);
        }
        emit YieldContributed(_msgSender(), toPrize);
    }

    /// @notice PoolTogether name for contributing prize tokens after yield liquidation.
    /// @dev Origin: https://dev.pooltogether.com/protocol/design/prize-pool#vaults-contribute-the-prize-token
    function contributePrizeTokens(uint64 amount) external {
        sponsor(amount);
    }

    /// @notice Mock yield harvest. Same as sponsor; documented as the liquidator entrypoint.
    /// @dev Origin: https://dev.pooltogether.com/protocol/design/#target-period-dutch-auction-tpda
    function liquidateYield(uint64 amount) external {
        sponsor(amount);
    }

    function availableYield() external view returns (uint64) {
        return prizeLiquidity;
    }

    // -------------------------------------------------------------------------
    // Chance delegation (TwabController.delegate)
    // Origin: https://dev.pooltogether.com/protocol/design/twab-controller
    //         https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#delegation-sweepstakes
    // -------------------------------------------------------------------------

    function delegate(address to) external {
        if (to == address(0)) revert ZeroAddress();
        _delegatee[_msgSender()] = to;
        emit Delegated(_msgSender(), to);
    }

    function delegateOf(address user) external view returns (address) {
        return _chanceOwner(user);
    }

    /// @notice Attach PoolTogether-style prize hooks (NFT sweepstakes, recycle, boost).
    /// @dev Origin: https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives
    function setHooks(PrizeHooks calldata hooks) external {
        _hooks[_msgSender()] = hooks;
        emit SetHooks(_msgSender(), hooks.useBeforeClaimPrize, hooks.useAfterClaimPrize, address(hooks.implementation));
    }

    function getHooks(address account) external view returns (PrizeHooks memory) {
        return _hooks[account];
    }

    /// @notice Resolve prize-hook recipients (coprocessor cannot resume after calls).
    /// @dev Call after `startDraw` (so draw entropy exists) and before `finalizeDraw`.
    function snapshotPrizeRecipients() external {
        uint256 len = _depositors.length;
        for (uint256 i; i < len; ++i) {
            address user = _depositors[i];
            _drawRecipient[user] = _prizeRecipient(user);
        }
        emit RecipientsSnapshotted(len);
    }

    /// @notice Public draw entropy for prize hooks. Vault winner selection uses encrypted FHE tickets instead.
    function getWinningRandomNumber() external view returns (uint256) {
        return uint256(lastDrawEntropy);
    }

    function confidentialTwabOf(address account) external view returns (euint64) {
        return _twabCumulative[account];
    }

    /// @notice TWAB rewards campaign: airdrop cUSDT proportional to share-seconds in the window.
    /// @dev Origin: https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#twab-rewards
    ///      `scale` is the public normalizer (expected total share-seconds). Reward = shares * heldSeconds * budget / scale.
    function createTwabCampaign(uint64 budget, uint32 duration, uint64 scale) external notDrawing {
        if (budget == 0 || duration == 0 || scale == 0) revert AmountZero();
        IERC20(asset).safeTransferFrom(_msgSender(), address(this), budget);
        IERC20(asset).safeIncreaseAllowance(address(wrapper), budget);
        wrapper.wrap(address(this), budget);
        uint256 id = ++twabCampaignCount;
        twabBudget[id] = budget;
        twabScale[id] = scale;
        twabStart[id] = uint32(block.timestamp);
        twabEnd[id] = uint32(block.timestamp) + duration;
        emit TwabCampaignCreated(id, _msgSender(), budget, duration, scale);
    }

    function claimTwabRewards(uint256 id) external {
        if (id == 0 || id > twabCampaignCount) revert InvalidCampaign();
        if (block.timestamp < twabEnd[id]) revert CampaignNotEnded();
        address user = _msgSender();
        if (twabClaimed[id][user]) revert AlreadyClaimed();
        twabClaimed[id][user] = true;
        _catchUpUser(user);

        uint32 from = uint32(lastActionAt[user]);
        uint32 start_ = twabStart[id];
        uint32 end_ = twabEnd[id];
        if (from < start_) from = start_;
        uint32 dt = end_ > from ? end_ - from : 0;

        euint64 share = _zeroIfEmpty(_shares[user]);
        euint64 twab = FHE.mul(share, uint64(dt));
        euint64 reward = FHE.div(FHE.mul(twab, twabBudget[id]), twabScale[id]);
        FHE.allowTransient(reward, address(prizeToken));
        prizeToken.confidentialTransfer(user, reward);
        emit TwabRewardsClaimed(id, user);
    }

    // -------------------------------------------------------------------------
    // Draws — award + FHE-weighted selection
    // Origin: https://dev.pooltogether.com/protocol/design/#draws
    // Draw Manager: https://dev.pooltogether.com/protocol/design/prize-pool#incentivized-draws
    // TWAB odds: https://dev.pooltogether.com/protocol/design/twab-controller
    // -------------------------------------------------------------------------

    function canStartDraw() public view returns (bool) {
        return
            !drawing &&
            prizeLiquidity > 0 &&
            _depositors.length > 0 &&
            block.timestamp >= lastDrawClose + drawPeriodSeconds;
    }

    /// @notice Permissionless award after the draw period (PoolTogether Draw Manager `startDraw`).
    /// @dev Freezes the running encrypted vault TWAB in O(1). `minHoldSeconds` zeros last-second deposits.
    ///      Pays `keeperReward` from `reserve` to `_msgSender()`. See TWAB.md.
    function startDraw() external {
        if (!canStartDraw()) revert DrawIntervalNotElapsed();
        _beginDraw(true);
        _payKeeper();
    }

    /// @notice Owner override so a demo/video can award immediately (current shares, no hold cliff).
    function forceDraw() external onlyOwner {
        if (drawing) revert DrawInProgress();
        _beginDraw(false);
    }

    /// @notice Kept for ABI / old keepers. Vault TWAB total is frozen in `startDraw` (O(1)).
    /// @dev Does not walk depositors. Marks the draw ready to finish.
    function stepDraw(uint8 n) external {
        if (!drawing) revert DrawNotInProgress();
        if (n == 0 || n > MAX_STEP) revert InvalidStep();
        uint256 len = _depositors.length;
        scanIndex = len;
        twabSumming = false;
        emit DrawStepped(openDrawId, scanIndex, len);
    }

    /// @notice Close the draw. Vault TWAB total was frozen at start. Does not reveal winners.
    /// @dev PoolTogether Draw Manager `finishDraw`. Pays `keeperReward` from `reserve`.
    function finalizeDraw() public {
        if (!drawing) revert DrawNotInProgress();

        drawing = false;
        lastAwardedDrawId = openDrawId;
        lastDrawClose = block.timestamp;
        emit DrawAwarded(openDrawId);
        openDrawId += 1;
        _payKeeper();
    }

    function canFinishDraw() public view returns (bool) {
        return drawing && _depositors.length > 0;
    }

    /// @notice PoolTogether draw lifecycle: 0 Open, 1 Closed, 2 Awarded, 3 Finalized.
    /// @dev Origin: https://dev.pooltogether.com/protocol/design/#draws
    function getDrawPhase() public view returns (uint8) {
        if (drawing) return DRAW_AWARDED;
        if (drawPeriodSeconds == 0) return DRAW_OPEN;
        if (block.timestamp < lastDrawClose + drawPeriodSeconds) return DRAW_OPEN;
        if (canStartDraw()) return DRAW_CLOSED;
        if (lastAwardedDrawId > 0) return DRAW_FINALIZED;
        return DRAW_CLOSED;
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
        return 0;
    }

    // -------------------------------------------------------------------------
    // Claims — self-claim and permissionless claim-for
    // Origin: https://dev.pooltogether.com/protocol/design/prize-claimer
    // FHE note: V5 auto-credits prizes and VRGDA takes a % of the prize. The winner
    // handle is encrypted, so the user (or a bot via claimFor) must still call claim.
    // -------------------------------------------------------------------------

    function claim() external {
        _claimTo(_msgSender(), _msgSender());
    }

    function claimTo(address receiver) external {
        _claimTo(_msgSender(), receiver);
    }

    /// @notice Anyone may claim on behalf of a winner. Prize always goes to the winner (or hook recipient).
    /// @dev PoolTogether Prize Claimer `claimPrizes`. Encrypted prizes cannot skim a VRGDA fee,
    ///      so bots are paid via gas sponsorship rather than taking a cut of the prize.
    function claimFor(address winner) external {
        if (winner == address(0)) revert ZeroAddress();
        _claimTo(winner, winner);
    }

    /// @notice Run PT `isWinner` for `account` on the last awarded draw. Credits encrypted winnings.
    /// @dev Does not transfer. Call `claim` to pull cUSDT. Losers get encrypted 0. Safe to call for anyone.
    function accruePrize(address account) public {
        _accruePrize(account);
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

    /// @notice Draw-manager keeper payout (USDT, 6 decimals). Origin: Prize Pool reserve.
    function setKeeperReward(uint64 amount) external onlyOwner {
        keeperReward = amount;
        emit KeeperRewardSet(amount);
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    /// @dev Pay the Draw Manager analog from reserve. No-op if reserve is empty.
    function _payKeeper() internal {
        uint64 pay = keeperReward;
        if (pay > reserve) pay = reserve;
        if (pay == 0) return;
        reserve -= pay;
        IERC20(asset).safeTransfer(_msgSender(), pay);
        emit KeeperRewarded(_msgSender(), pay);
    }

    function _beginDraw(bool enforceHold) internal {
        if (_depositors.length == 0) revert NoDepositors();
        if (prizeLiquidity == 0) revert NoPrizeLiquidity();
        if (!FHE.isInitialized(_totalShares)) revert NoDepositors();

        uint64 grand = uint64((uint256(prizeLiquidity) * GRAND_TIER_BPS) / BPS_DENOMINATOR);
        uint64 daily = prizeLiquidity - grand;
        lastDrawPrize = prizeLiquidity;
        lastGrandPrize = grand;
        lastDailyPrize = daily;
        lastDrawEntropy = keccak256(abi.encode(block.prevrandao, block.timestamp, openDrawId, prizeLiquidity));
        prizeLiquidity = 0;

        _grandPrizeEnc = FHE.asEuint64(grand);
        _dailyPrizeEnc = FHE.asEuint64(daily);
        _grandLeft = _grandPrizeEnc;
        _dailyLeft = _dailyPrizeEnc;
        FHE.allowThis(_grandPrizeEnc);
        FHE.allowThis(_dailyPrizeEnc);
        FHE.allowThis(_grandLeft);
        FHE.allowThis(_dailyLeft);

        _enforceMinHold = enforceHold;
        lastDrawUsedShares = !enforceHold || drawPeriodSeconds == 0;
        drawUsedShares[openDrawId] = lastDrawUsedShares;
        drawStartedAt = block.timestamp;
        drawStartedAtOf[openDrawId] = uint32(block.timestamp);

        _syncGlobalTwab();
        if (lastDrawUsedShares) {
            _eligibleTwabTotal = _zeroIfEmpty(_totalShares);
        } else {
            _eligibleTwabTotal = FHE.sub(_zeroIfEmpty(_twabCumulativeTotal), _zeroIfEmpty(_twabTotalSnap));
        }
        _twabTotalSnap = _zeroIfEmpty(_twabCumulativeTotal);
        FHE.allowThis(_eligibleTwabTotal);
        FHE.allowThis(_twabTotalSnap);

        twabSumming = false;
        drawing = true;
        scanIndex = _depositors.length;
        emit DrawStarted(openDrawId, grand, daily, _depositors.length);
    }

    /// @dev ticket ≈ Uniform[0, totalShares) via (rand64 * total) >> 64 in 128-bit space.
    function _mapTicket(euint64 randVal, euint64 total) internal returns (euint64) {
        euint128 prod = FHE.mul(FHE.asEuint128(randVal), FHE.asEuint128(total));
        return FHE.asEuint64(FHE.shr(prod, uint8(64)));
    }

    /// @dev PoolTogether V5 `isWinner`: uniform(userSeed, totalTwab) < userTwab * tierOdds.
    ///      Seed is public (draw entropy + account + tier); total and TWAB stay encrypted.
    function _winningZone(euint64 twab, uint16 bps) internal returns (euint64) {
        euint128 zone = FHE.div(FHE.mul(FHE.asEuint128(twab), uint128(bps)), uint128(BPS_DENOMINATOR));
        return FHE.asEuint64(zone);
    }

    function _isWinner(address account, uint8 tier, uint16 bps, euint64 weight, euint64 total) internal returns (ebool) {
        uint64 seed = uint64(uint256(keccak256(abi.encodePacked(lastDrawEntropy, account, tier))));
        euint64 ticket = _mapTicket(FHE.asEuint64(seed), total);
        return FHE.lt(ticket, _winningZone(weight, bps));
    }

    /// @dev Integrate encrypted `_totalShares` forward. One mul+add, independent of roster size.
    ///      Origin: https://dev.pooltogether.com/protocol/design/twab-controller
    ///      HCU: https://docs.zama.org/protocol/solidity-guides/development-guide/hcu
    function _syncGlobalTwab() internal {
        uint32 ts = uint32(block.timestamp);
        uint32 last = lastGlobalTwabTs;
        if (last == 0) {
            lastGlobalTwabTs = ts;
            return;
        }
        uint32 dt = ts - last;
        if (dt == 0) return;
        euint64 next = FHE.add(_zeroIfEmpty(_twabCumulativeTotal), FHE.mul(_zeroIfEmpty(_totalShares), uint64(dt)));
        _twabCumulativeTotal = next;
        lastGlobalTwabTs = ts;
        FHE.allowThis(next);
    }

    function _accrueUserTo(address user, uint32 ts) internal {
        uint32 last = lastTwabTimestamp[user];
        if (last == 0) {
            lastTwabTimestamp[user] = ts;
            return;
        }
        if (ts <= last) return;
        uint32 dt = ts - last;
        euint64 next = FHE.add(_zeroIfEmpty(_twabCumulative[user]), FHE.mul(_zeroIfEmpty(_shares[user]), uint64(dt)));
        _twabCumulative[user] = next;
        lastTwabTimestamp[user] = ts;
        FHE.allowThis(next);
        FHE.allow(next, user);
    }

    /// @dev Freeze this user's weight for each awarded draw they have not snapped yet, then accrue to now.
    function _catchUpUser(address user) internal {
        _syncGlobalTwab();
        uint256 awarded = lastAwardedDrawId;
        uint256 snapId = userSnapDrawId[user];
        if (!drawing && awarded > snapId) {
            for (uint256 id = snapId + 1; id <= awarded; ++id) {
                uint32 t = drawStartedAtOf[id];
                if (t == 0) t = uint32(drawStartedAt);
                _accrueUserTo(user, t);
                if (id == awarded) {
                    euint64 weight = _weightAtDraw(user, id);
                    _drawWeight[user] = weight;
                    FHE.allowThis(weight);
                    FHE.allow(weight, user);
                }
                euint64 cum = _zeroIfEmpty(_twabCumulative[user]);
                _twabSnapshot[user] = cum;
                FHE.allowThis(cum);
                FHE.allow(cum, user);
            }
            userSnapDrawId[user] = awarded;
        }
        _accrueUserTo(user, uint32(block.timestamp));
    }

    /// @dev Permissionless draws: period share-seconds (cum - snap). Last-second deposits are 0.
    ///      Force / period-0 draws: current shares. Vault total was frozen in `startDraw`.
    function _weightAtDraw(address user, uint256 drawId) internal returns (euint64) {
        uint32 started = drawStartedAtOf[drawId];
        if (drawUsedShares[drawId]) {
            return _zeroIfEmpty(_shares[user]);
        }
        if (minHoldSeconds != 0 && lastActionAt[user] + minHoldSeconds > started) {
            return FHE.asEuint64(0);
        }
        return FHE.sub(_zeroIfEmpty(_twabCumulative[user]), _zeroIfEmpty(_twabSnapshot[user]));
    }

    function _accruePrize(address account) internal {
        if (drawing) revert DrawInProgress();
        if (lastAwardedDrawId == 0 || account == address(0)) return;
        if (prizeSettled[lastAwardedDrawId][account]) return;
        prizeSettled[lastAwardedDrawId][account] = true;

        _catchUpUser(account);
        euint64 weight = _zeroIfEmpty(_drawWeight[account]);
        euint64 total = _zeroIfEmpty(_eligibleTwabTotal);
        ebool wonGrand = _isWinner(account, 0, GRAND_TIER_BPS, weight, total);
        ebool wonDaily = _isWinner(account, 1, BPS_DENOMINATOR - GRAND_TIER_BPS, weight, total);

        euint64 payGrand = FHE.select(wonGrand, _grandLeft, FHE.asEuint64(0));
        _grandLeft = FHE.sub(_grandLeft, payGrand);
        FHE.allowThis(_grandLeft);

        euint64 payDaily = FHE.select(wonDaily, _dailyLeft, FHE.asEuint64(0));
        _dailyLeft = FHE.sub(_dailyLeft, payDaily);
        FHE.allowThis(_dailyLeft);

        euint64 bonus = FHE.add(payGrand, payDaily);
        address recipient = _drawRecipient[account];
        if (recipient == address(0)) recipient = _chanceOwner(account);

        euint64 current = _zeroIfEmpty(_winnings[recipient]);
        euint64 updated = FHE.add(current, bonus);
        _winnings[recipient] = updated;
        FHE.allowThis(updated);
        FHE.allow(updated, recipient);
        emit PrizeAccrued(account, recipient);
    }

    function _withdrawAmount(euint64 requested, address owner_, address receiver, bool exitVault) internal {
        if (receiver == address(0)) revert ZeroAddress();
        _catchUpUser(owner_);
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
        _accruePrize(winner);
        euint64 amount = _zeroIfEmpty(_winnings[winner]);
        _winnings[winner] = FHE.asEuint64(0);
        FHE.allowThis(_winnings[winner]);
        FHE.allow(_winnings[winner], winner);
        FHE.allowTransient(amount, address(prizeToken));
        prizeToken.confidentialTransfer(receiver, amount);
        PrizeHooks memory h = _hooks[winner];
        if (h.useAfterClaimPrize && address(h.implementation) != address(0)) {
            try h.implementation.afterClaimPrize(winner, 0, 0, lastDrawPrize, receiver, "") {} catch {}
        }
        emit Claimed(winner, receiver);
    }

    function _creditShares(address account, euint64 amount) internal {
        _catchUpUser(account);
        euint64 next = FHE.add(_zeroIfEmpty(_shares[account]), amount);
        _shares[account] = next;
        _totalShares = FHE.add(_zeroIfEmpty(_totalShares), amount);
        FHE.allowThis(next);
        FHE.allow(next, account);
        FHE.allowThis(_totalShares);
    }

    function _addDepositor(address user) internal {
        if (_depositorIndex[user] != 0) return;
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

    /// @dev Delegation first, then optional beforeClaimPrize hook (NFT sweepstakes).
    function _prizeRecipient(address user) internal returns (address winner) {
        winner = _chanceOwner(user);
        PrizeHooks memory h = _hooks[user];
        if (!h.useBeforeClaimPrize || address(h.implementation) == address(0)) return winner;
        try h.implementation.beforeClaimPrize(user, 0, 0, 0, address(0)) returns (address recipient, bytes memory) {
            if (recipient != address(0)) winner = recipient;
        } catch {}
    }

    function _accrueTwab(address user) internal {
        _catchUpUser(user);
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

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
