import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: string;
  description: ReactNode;
  linkLabel: string;
  href: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Real-Time Collaboration',
    icon: '👥',
    description: (
      <>
        Write together with your co-authors in real-time. See changes as they
        happen, with conflict-free editing powered by CRDT technology. No more
        emailing draft versions back and forth.
      </>
    ),
    linkLabel: 'Learn about collaboration →',
    href: '/features',
  },
  {
    title: 'Self-Hosted & Private',
    icon: '🔒',
    description: (
      <>
        Your stories, your server. Deploy Inkweld on your own infrastructure
        with Docker or Docker Compose. Complete control over your data and
        privacy—no cloud service required.
      </>
    ),
    linkLabel: 'Start hosting →',
    href: '/docs/installation',
  },
  {
    title: 'Built for Writers',
    icon: '✍️',
    description: (
      <>
        Organize novels with chapters and scenes. Build detailed worlds with
        character profiles, locations, and lore. Work offline and sync when
        you're ready. Everything a creative writer needs.
      </>
    ),
    linkLabel: 'Explore features →',
    href: '/features',
  },
];

function Feature({ title, icon, description, linkLabel, href }: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.featureCard)}>
      <div className={styles.featureIcon}>{icon}</div>
      <Heading as="h3" className={styles.featureTitle}>
        {title}
      </Heading>
      <p className={styles.featureBody}>{description}</p>
      <Link className={styles.featureLink} to={href}>
        {linkLabel}
      </Link>
    </div>
  );
}

function ShowcaseSection(): ReactNode {
  return (
    <section className={styles.showcase}>
      <div className="container">
        <div className={styles.showcaseGrid}>
          <div className={styles.showcaseItem}>
            <div className={styles.showcaseImageWrapper}>
              <img
                src="/img/generated/bookshelf-desktop-light.png"
                alt="Project Dashboard"
                className={clsx(
                  styles.showcaseImage,
                  styles.showcaseImageLight
                )}
              />
              <img
                src="/img/generated/bookshelf-desktop-dark.png"
                alt="Project Dashboard"
                className={clsx(styles.showcaseImage, styles.showcaseImageDark)}
              />
            </div>
            <div className={styles.showcaseText}>
              <Heading as="h3">Beautiful Project Dashboard</Heading>
              <p>
                Organize all your writing projects in one place. See what you've
                been working on at a glance.
              </p>
            </div>
          </div>
          <div
            className={clsx(styles.showcaseItem, styles.showcaseItemReverse)}
          >
            <div className={styles.showcaseText}>
              <Heading as="h3">Distraction-Free Editor</Heading>
              <p>
                Focus on your words with a clean, modern editor. Rich text
                formatting, real-time collaboration, and offline support.
              </p>
            </div>
            <div className={styles.showcaseImageWrapper}>
              <img
                src="/img/generated/editor-desktop-light.png"
                alt="Editor Interface"
                className={clsx(
                  styles.showcaseImage,
                  styles.showcaseImageLight
                )}
              />
              <img
                src="/img/generated/editor-desktop-dark.png"
                alt="Editor Interface"
                className={clsx(styles.showcaseImage, styles.showcaseImageDark)}
              />
            </div>
          </div>
          <div className={styles.showcaseItem}>
            <div className={styles.mobileShowcaseWrapper}>
              <div className={styles.mobileImageContainer}>
                <img
                  src="/img/generated/editor-mobile-light.png"
                  alt="Mobile Editor"
                  className={clsx(
                    styles.mobileImage,
                    styles.showcaseImageLight
                  )}
                />
                <img
                  src="/img/generated/editor-mobile-dark.png"
                  alt="Mobile Editor"
                  className={clsx(styles.mobileImage, styles.showcaseImageDark)}
                />
              </div>
              <div className={styles.mobileImageContainer}>
                <img
                  src="/img/generated/bookshelf-mobile-light.png"
                  alt="Mobile Bookshelf"
                  className={clsx(
                    styles.mobileImage,
                    styles.showcaseImageLight
                  )}
                />
                <img
                  src="/img/generated/bookshelf-mobile-dark.png"
                  alt="Mobile Bookshelf"
                  className={clsx(styles.mobileImage, styles.showcaseImageDark)}
                />
              </div>
            </div>
            <div className={styles.showcaseText}>
              <Heading as="h3">Write Anywhere</Heading>
              <p>
                Fully responsive design means you can write on desktop, tablet,
                or phone. Your stories go where you go.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <>
      <section className={styles.features}>
        <div className="container">
          <Heading as="h2" className={styles.sectionTitle}>
            Why Choose Inkweld?
          </Heading>
          <div className={clsx('row', styles.featureRow)}>
            {FeatureList.map((props) => (
              <Feature key={props.title} {...props} />
            ))}
          </div>
        </div>
      </section>
      <ShowcaseSection />
    </>
  );
}
