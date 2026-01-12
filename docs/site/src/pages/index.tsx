import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

function HomepageHeader(): ReactNode {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <Heading as="h1" className="hero__title">
              Own Your Words
            </Heading>
            <p className={clsx('hero__subtitle', styles.heroSubtitle)}>
              The self-hosted collaborative writing platform for novelists,
              screenwriters, and creative teams. Real-time collaboration meets
              complete data ownership.
            </p>
            <div className={styles.buttons}>
              <Link
                className="button button--secondary button--lg"
                to="/docs/installation"
              >
                Get Started
              </Link>
              <Link
                className="button button--outline button--lg"
                to="/features"
              >
                Explore Features
              </Link>
            </div>
            <div className={styles.heroMeta}>
              <span className={styles.badge}>🔒 Self-Hosted</span>
              <span className={styles.badge}>🆓 Open Source</span>
              <span className={styles.badge}>⚡ Real-Time</span>
            </div>
          </div>
          <div className={styles.heroImage}>
            <img
              src="/img/generated/editor-desktop-light.png"
              alt="Inkweld Editor"
              className={clsx(styles.screenshot, styles.screenshotLight)}
            />
            <img
              src="/img/generated/editor-desktop-dark.png"
              alt="Inkweld Editor"
              className={clsx(styles.screenshot, styles.screenshotDark)}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Self-Hosted Collaborative Writing"
      description="Inkweld is a self-hosted collaborative writing platform for novelists, screenwriters, and creative teams. Real-time editing, worldbuilding tools, and complete data ownership."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
