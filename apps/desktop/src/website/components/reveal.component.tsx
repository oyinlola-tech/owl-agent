import { useEffect, useRef, type ReactNode } from "react";

export function Reveal({ children, className = "", delay = 0, as: Element = "div" }: {
  children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section";
}) {
  const elementRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      element.classList.add("seen");
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { element.classList.add("seen"); observer.disconnect(); }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Element ref={elementRef as any} className={`rise ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Element>
  );
}
