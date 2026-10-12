import { useEffect, useState } from "react";

export function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0]);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visibleEntries = entries.filter((entry) => entry.isIntersecting).sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top);
      if (visibleEntries[0]) setActiveId(visibleEntries[0].target.id);
    }, { rootMargin: "-80px 0px -65% 0px" });
    ids.forEach((id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
    const highlightFirstSectionNearTop = () => { if (window.scrollY < 300) setActiveId(ids[0]); };
    window.addEventListener("scroll", highlightFirstSectionNearTop, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener("scroll", highlightFirstSectionNearTop); };
  }, [ids]);
  return activeId;
}
