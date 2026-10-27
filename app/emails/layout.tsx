import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";
import type { ReactNode } from "react";
import { styles } from "./tokens";
import { identity } from "~/identity";
import type { AudienceText } from "~/i18n/audience";

// ─────────────────────────────────────────────────────────────────────────────
// THE email layout. Every email in this app composes this one component plus the
// primitives below — NEVER hand-built HTML strings.
//
// One layout means a change to the brand, the footer, or the card happens once.
// A template's job is copy and which primitives it uses, nothing else.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmailLayoutProps {
  /**
   * The snippet the inbox list shows next to the subject. Write it: left empty,
   * clients scrape the first words of the body, which is usually "Hello Name,".
   */
  preview: string;
  heading: string;
  children: ReactNode;
  /**
   * Absolute URL to a logo. Email clients do not render SVG and many block
   * remote images by default, so the brand name below is always present as the
   * fallback — the layout must read correctly with images off.
   */
  logoUrl?: string;
  brandName?: string;
  /** Overrides the sender disclosure (default: `email:senderDisclosure`, in the reader's language). */
  footer?: string;
  /** The reader's language: `<html lang>`, `dir`, the sender disclosure and the link line follow it. */
  text: AudienceText;
}

export function EmailLayout({
  preview,
  heading,
  children,
  logoUrl,
  brandName = identity.brandName,
  footer,
  text,
}: EmailLayoutProps) {
  const resolvedFooter = footer ?? text.fixedT("email")("senderDisclosure");
  return (
    <Html lang={text.language} dir={text.direction}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          {logoUrl ? (
            <Img src={logoUrl} alt={brandName} style={styles.logo} />
          ) : null}
          <Text style={styles.brand}>{brandName}</Text>
          <Heading style={styles.heading}>{heading}</Heading>
          {children}
          <Hr style={styles.hr} />
          <Text style={styles.footer}>{resolvedFooter}</Text>
        </Container>
      </Body>
    </Html>
  );
}

/** Body paragraph. */
export function P({ children }: { children: ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}

/** Secondary line — expiry notes, "if this wasn't you", small print. */
export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/**
 * Primary call to action, plus the raw URL underneath.
 *
 * The visible link matters: plenty of clients strip the button's background, and
 * some strip anchors from styled blocks entirely. A recipient who cannot click
 * can still copy. It is also what makes the plain-text rendering useful, since a
 * button with no text URL becomes a dead word there.
 */
export function Cta({ href, text, children }: { href: string; text: AudienceText; children: ReactNode }) {
  return (
    <>
      <Section style={styles.buttonSection}>
        <Button href={href} style={styles.button}>
          {children}
        </Button>
      </Section>
      <Text style={styles.fallback}>
        {text.fixedT("email")("cta.copyLink")} <Link href={href}>{href}</Link>
      </Text>
    </>
  );
}
