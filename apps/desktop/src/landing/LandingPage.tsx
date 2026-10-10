import "./landing.css";
import Navbar from "./Navbar";
import Hero from "./Hero";
import Sections from "./Sections";
import Footer from "./Footer";

export default function LandingPage({ theme, toggle }: { theme: "light" | "dark"; toggle: () => void }) {
  return (
    <div className="owl">
      <Navbar theme={theme} toggle={toggle} />
      <Hero />
      <Sections />
      <Footer />
    </div>
  );
}
