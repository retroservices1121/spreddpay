const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@spreddpay.com";

const features = [
  ["01", "Branded virtual cards", "Give traders a card experience that feels native to your platform—not a third-party redirect."],
  ["02", "USDC payout workflows", "Create a clear path from approved trader payout to available balance and card spending."],
  ["03", "Partner operations", "Manage users, payouts, cards, branding, activity, and reporting from one dashboard."]
];

export default function Home() {
  return (
    <main>
      <nav className="nav container">
        <a className="brand" href="#top"><span className="brandMark">S</span><span>SpreddPay</span></a>
        <div className="navLinks">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a className="navCta" href={`mailto:${contactEmail}`}>Partner with us</a>
        </div>
      </nav>

      <section className="hero container" id="top">
        <div className="eyebrow">Embedded payout infrastructure for funded trading firms</div>
        <h1>Launch your own<span> branded payout card.</span></h1>
        <p className="heroCopy">SpreddPay helps funded trading platforms give traders a seamless way to receive approved USDC payouts and access them through a branded virtual card experience.</p>
        <div className="heroActions">
          <a className="primaryButton" href={`mailto:${contactEmail}?subject=SpreddPay partnership`}>Discuss a partnership</a>
          <a className="secondaryButton" href="#product">Explore the platform</a>
        </div>

        <div className="heroGrid">
          <div className="dashboardCard">
            <div className="dashboardTop">
              <div><p className="mutedLabel">Available payout balance</p><p className="balance">$4,850.00</p></div>
              <div className="statusPill">Available</div>
            </div>
            <div className="virtualCard">
              <div className="cardBrandRow"><span>FUNDING PLATFORM</span><span className="network">VIRTUAL</span></div>
              <div className="cardNumber">•••• &nbsp;•••• &nbsp;•••• &nbsp;4821</div>
              <div className="cardFooter"><span>TRADER PAYOUT CARD</span><span>12/29</span></div>
            </div>
            <div className="activity">
              <div className="activityRow"><div className="activityIcon">↙</div><div className="activityText"><strong>Trader payout</strong><span>Today</span></div><strong className="positive">+$4,850.00</strong></div>
              <div className="activityRow"><div className="activityIcon">↗</div><div className="activityText"><strong>Online purchase</strong><span>Pending</span></div><strong>−$84.23</strong></div>
            </div>
          </div>

          <div className="partnerPanel">
            <div className="panelHeader"><span>Partner dashboard</span><span className="liveDot">Live preview</span></div>
            <div className="metric"><span>Active cardholders</span><strong>5,000</strong></div>
            <div className="metric"><span>Projected monthly spend</span><strong>$2.5M</strong></div>
            <div className="metric"><span>Payouts this month</span><strong>$1.84M</strong></div>
            <button className="mockButton" type="button">Create payout</button>
          </div>
        </div>
      </section>

      <section className="section container" id="product">
        <div className="sectionIntro"><p className="sectionKicker">The product</p><h2>Your brand. Your traders. One payout experience.</h2><p>SpreddPay provides the software layer between funded trading firms and financial infrastructure providers.</p></div>
        <div className="featureGrid">{features.map(([n,t,d]) => <article className="featureCard" key={n}><span className="featureNumber">{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div>
      </section>

      <section className="darkSection" id="how"><div className="container">
        <div className="sectionIntro light"><p className="sectionKicker">How it works</p><h2>From approved payout to card access.</h2><p>A focused workflow built around the moment funded traders care about most: getting paid.</p></div>
        <div className="steps">
          <div className="step"><span>01</span><h3>Approve</h3><p>Your team approves an eligible trader payout.</p></div>
          <div className="step"><span>02</span><h3>Deposit</h3><p>The payout is routed to the trader’s branded account.</p></div>
          <div className="step"><span>03</span><h3>Spend</h3><p>The trader accesses a virtual card and manages activity.</p></div>
        </div>
      </div></section>

      <section className="section container"><div className="ctaBlock"><div><p className="sectionKicker">Design partner program</p><h2>Building the payout layer funded trading firms already need.</h2><p>We are speaking with launch partners and infrastructure providers for an initial virtual-card beta.</p></div><a className="primaryButton" href={`mailto:${contactEmail}?subject=SpreddPay design partner`}>Contact SpreddPay</a></div></section>

      <footer className="footer container"><a className="brand" href="#top"><span className="brandMark">S</span><span>SpreddPay</span></a><p>SpreddPay is a technology platform and is not a bank. Financial accounts and cards are subject to partner approval, eligibility, and applicable terms.</p><span>© 2026 SpreddPay</span></footer>
    </main>
  );
}
