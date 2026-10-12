import { HeroSection } from "../sections/hero/hero.section";
import { ProductShotSection } from "../sections/productShot/productShot.section";
import { HowItRunsSection } from "../sections/features/howItRuns.section";
import { FeaturesSection } from "../sections/features/features.section";
import { SafetySection } from "../sections/trust/safety.section";
import { PermissionsSection } from "../sections/trust/permissions.section";
import { FaqSection } from "../sections/closing/faq.section";
import { ClosingCtaSection } from "../sections/closing/cta.section";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProductShotSection />
      <HowItRunsSection />
      <FeaturesSection />
      <SafetySection />
      <PermissionsSection />
      <FaqSection />
      <ClosingCtaSection />
    </>
  );
}
