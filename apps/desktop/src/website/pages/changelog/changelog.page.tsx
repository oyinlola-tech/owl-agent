import { Tag, Tile } from "../../../shared/components/tag.component";
import { PageIntro } from "../../components/pageIntro.component";
import { Reveal } from "../../components/reveal.component";
import { RELEASE_HISTORY } from "./releaseHistory.data";
import "./changelog.style.css";

export function ChangelogPage() {
  return (
    <>
      <PageIntro eyebrow="Changelog" title="What's new in OWL."
        lede="Every release, grouped by area. The service and the app ship together." />
      <div className="wrap log">
        {RELEASE_HISTORY.map((release) => (
          <Reveal key={release.v} className="rel">
            <div className="rel-side">
              <span className="rel-v">{release.v === "Unreleased" ? release.v : `v${release.v}`}</span>
              <span className="rel-date">{release.date}</span>
              {release.tag && <Tag hue={release.tag.hue} dot>{release.tag.label}</Tag>}
            </div>
            <span className="rel-dot" aria-hidden="true" />
            <div className="rel-body">
              <h2>{release.title}</h2>
              {release.groups.map((group) => (
                <div key={group.h} className="rel-group">
                  <h3><Tile icon={group.icon} hue={group.hue} /> {group.h}</h3>
                  <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </>
  );
}
