function Chip({
  children,
  tone = 'plain',
}: {
  children: string
  tone?: 'plain' | 'cta' | 'yellow' | 'ink'
}) {
  return <span className={`btn guide-chip${tone === 'plain' ? '' : ` ${tone}`}`}>{children}</span>
}

function Row({ name, tone, does }: { name: string; tone?: 'plain' | 'cta' | 'yellow' | 'ink'; does: string }) {
  return (
    <div className="guide-row">
      <Chip tone={tone}>{name}</Chip>
      <p>{does}</p>
    </div>
  )
}

export function Guide() {
  return (
    <div className="guide">
      <section className="guide-hero">
        <p className="hero-kicker">Playbook · Sepolia</p>
        <h1 className="display">How</h1>
        <p className="tagline">Every button. One loop.</p>
        <p className="lede">
          Lantern is a no-loss prize vault. You deposit confidential USDT. Draws pick a winner with encrypted
          ticket weights. Principal always comes back. The chain never publishes who won, or how much you put in.
        </p>
        <div className="hero-actions">
          <a className="btn cta" href="#play">
            Back to play
          </a>
          <a className="btn yellow" href="#guide-demo">
            Demo click path
          </a>
        </div>
      </section>

      <nav className="guide-jump" aria-label="Guide sections">
        <a href="#guide-loop">Loop</a>
        <a href="#guide-bar">Bar</a>
        <a href="#guide-save">Save</a>
        <a href="#guide-draw">Draw</a>
        <a href="#guide-more">More</a>
        <a href="#guide-grey">Grey</a>
      </nav>

      <div className="dots">
        <section className="guide-block" id="guide-loop">
          <div className="section-head">
            <h2>
              The <em>loop</em>
            </h2>
            <p>Do Save first. Draw can be you or someone else. More is optional.</p>
          </div>
          <ol className="guide-steps">
            <li>
              <strong>01</strong>
              <span>Sign in with email OTP for the gasless passkey wallet.</span>
            </li>
            <li>
              <strong>02</strong>
              <span>Claim public test USDT, then shield it into confidential cUSDT.</span>
            </li>
            <li>
              <strong>03</strong>
              <span>Deposit. Amount stays encrypted. Shares are 1:1.</span>
            </li>
            <li>
              <strong>04</strong>
              <span>Authorize decrypt so this page can show your numbers.</span>
            </li>
            <li>
              <strong>05</strong>
              <span>Feed a prize in public USDT. The pool wraps 90% to encrypted cUSDT for private claims. 10% stays in reserve to pay whoever runs the draw.</span>
            </li>
            <li>
              <strong>06</strong>
              <span>Run draw. Odds use encrypted share-seconds. Winner is not published.</span>
            </li>
            <li>
              <strong>07</strong>
              <span>If you won, claim. A claim tx is public; the amount is not.</span>
            </li>
            <li>
              <strong>08</strong>
              <span>Take your deposit anytime. That is your money, not the prize.</span>
            </li>
          </ol>
        </section>

        <section className="guide-block" id="guide-bar">
          <div className="section-head">
            <h2>
              Top <em>bar</em>
            </h2>
            <p>Always visible. Wallet and chain live here, not in the tabs.</p>
          </div>
          <div className="board">
            <Row name="Sign in" tone="cta" does="Opens Openfort. Email OTP creates a passkey EOA and can pay Sepolia gas. MetaMask only logs you in — that wallet still needs ETH." />
            <Row name="QR 0x…" tone="yellow" does="Your short address. Click it for the full address, a QR to fund, copy, and Etherscan." />
            <Row name="Tx dock" does="A card that stays on screen while a transaction is signing, confirming, confirmed, or failed. Includes the Etherscan link." />
            <Row name="Disconnect" does="Signs out of Openfort and disconnects wagmi." />
            <Row name="Gasless" tone="yellow" does="A label, not a button. Means a paymaster is configured. It only covers the Openfort email wallet, not MetaMask." />
            <Row name="Sepolia" does="The only chain. Email login is placed here automatically. Vault writes stay off until this pill is up." />
            <Row name="Play" does="Jumps to the Save / Draw / More board." />
            <Row name="How" tone="yellow" does="This page." />
          </div>
        </section>

        <section className="guide-block" id="guide-save">
          <div className="section-head">
            <h2>
              Save <em>tab</em>
            </h2>
            <p>Your money. Yellow row is the next step. Order matters: mint, shield, deposit.</p>
          </div>
          <div className="board">
            <Row name="Sign in" tone="cta" does="Same as the nav. Until this is done, the rest of Save is disabled." />
            <Row name="Authorize" tone="ink" does="One EIP-712 signature. After that the page can decrypt your cUSDT, shares, and winnings. Other wallets still cannot." />
            <Row name="Claim 100 USDT" tone="yellow" does="Mints 100 public test USDT to you from Zama’s Sepolia mock. Not in the vault yet." />
            <Row name="Shield" tone="cta" does="Wraps the public USDT amount you enter into confidential cUSDT. Leave some unwrapped to feed the prize. The vault only takes cUSDT." />
            <Row name="Deposit" tone="cta" does="Sends the amount field into the pool. Size stays encrypted. You get shares 1:1 and enter the draw set." />
            <Row name="Check prize" does="Asks if you won this draw. Fills the Won box (0 if you lost). Does not move your deposit." />
            <Row name="Claim my prize" tone="cta" does="Takes the prize you won. Your deposit stays in the vault." />
            <Row name="Claim to" does="Same prize, sent to the address in Send prize to. Your win, someone else’s wallet." />
            <Row name="Withdraw some" does="Takes the withdraw amount of your deposit out as cUSDT. Not the prize." />
            <Row name="Withdraw all" does="Takes your whole deposit out. Leaves the draw. Claim a prize first if you won." />
          </div>
        </section>

        <section className="guide-block" id="guide-draw">
          <div className="section-head">
            <h2>
              Draw <em>tab</em>
            </h2>
            <p>The round. Depositors can skip this and wait. For a demo, run it yourself.</p>
          </div>
          <div className="board">
            <Row name="Approve" does="Lets the pool pull the Prize (public USDT) amount. Do this before Sponsor or Liquidate." />
            <Row name="Sponsor" tone="cta" does="Pays public USDT in. The pool wraps 90% to encrypted cUSDT so claims stay private. Prize size stays public. 10% stays unwrapped to pay whoever clicks Start or Finish." />
            <Row name="Liquidate" does="Same as Sponsor. Use one or the other for the same tokens." />
            <Row name="Start only" does="Closes the round (PoolTogether startDraw). Snapshots hook recipients. Does not finish." />
            <Row name="Run draw" tone="cta" does="Start, sample onchain FHE.rand, select winners over encrypted TWAB in batches, finish, check your prize. One click to run the whole round." />
            <Row name="Force + finish" tone="yellow" does="Owner only. Ignores the 60s clock so a video can award immediately, then finishes." />
            <Row name="Finish draw" tone="cta" does="PoolTogether finishDraw. Vault TWAB was already frozen at Start. Awards the draw, then Check prize on Save." />
          </div>
        </section>

        <section className="guide-block" id="guide-more">
          <div className="section-head">
            <h2>
              More <em>tab</em>
            </h2>
            <p>Optional extras. You do not need these to save or cash out.</p>
          </div>
          <div className="board">
            <Row name="Unshield all" does="Turns your cUSDT back into public USDT. Use after Withdraw all if you want the mock token spendable again." />
            <Row name="Claim for winner" does="Paste someone else’s address. You send the tx; the prize still goes to them. Bot / claimer pattern." />
            <Row name="Delegate" tone="yellow" does="Your chance points at another address. Your deposit stays yours. They can win with your tickets." />
            <Row name="Mint duck" tone="yellow" does="Mints a Duck NFT used by the prize hook." />
            <Row name="Attach hook" tone="cta" does="If you would have won, the prize is redirected to a random Duck holder." />
            <Row name="Clear hook" does="Turns the NFT redirect off." />
            <Row name="Approve" does="Lets the pool pull the campaign budget. Needs public USDT, same as Feed the prize." />
            <Row name="Create campaign" tone="cta" does="Pays public USDT in as an airdrop pot. Not the main prize draw. Depositors claim after the window, by amount × time held." />
            <Row name="Claim latest" tone="yellow" does="Pulls your share of that TWAB campaign after the window ends." />
          </div>
        </section>

        <section className="guide-block" id="guide-grey">
          <div className="section-head">
            <h2>
              If it’s <em>grey</em>
            </h2>
            <p>Disabled means the step is not allowed yet, not that the app is broken.</p>
          </div>
          <div className="banner warn">
            Not signed in, a transaction in flight, draw period still ticking, no prize liquidity, no depositors,
            or the draw is not open. Email login is already Sepolia.
          </div>
        </section>

        <section className="guide-block" id="guide-demo">
          <div className="section-head">
            <h2>
              Demo <em>path</em>
            </h2>
            <p>Use http://localhost:5173, not 127.0.0.1. Email OTP, not MetaMask, if you want gasless.</p>
          </div>
          <ol className="guide-demo">
            <li>
              <Chip tone="cta">Sign in</Chip>
              <span>email OTP</span>
            </li>
            <li>
              <Chip tone="ink">Authorize</Chip>
            </li>
            <li>
              <Chip tone="yellow">Claim 100 USDT</Chip>
              <Chip tone="cta">Shield</Chip>
              <Chip tone="cta">Deposit</Chip>
              <span>10</span>
            </li>
            <li>
              <span>Draw tab</span>
              <Chip>Approve</Chip>
              <Chip tone="cta">Sponsor</Chip>
            </li>
            <li>
              <Chip tone="cta">Run draw</Chip>
              <span>or Force + finish if you are owner</span>
            </li>
            <li>
              <span>Save tab</span>
              <Chip tone="cta">Claim my prize</Chip>
            </li>
            <li>
              <Chip>Withdraw all</Chip>
              <span>More tab</span>
              <Chip>Unshield all</Chip>
            </li>
          </ol>
          <p className="guide-foot">
            <a className="btn cta" href="#play">
              Open the vault
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
