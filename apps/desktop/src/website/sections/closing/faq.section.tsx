import { ArrowRight, Plus } from "@phosphor-icons/react";
import { SiteLink } from "../../components/siteLink.component";
import { SectionHeading } from "../sectionHeading.component";
import "./closing.style.css";

const FAQ_ENTRIES = [
  { q: "Does my code leave my machine?",
    a: "The service runs on 127.0.0.1 and reads files from disk. The parts the agent needs for a step are sent as context to the model provider you configure. Nothing else is uploaded." },
  { q: "Which models does it use?",
    a: "OWL ships with an NVIDIA provider. The router picks a model per request from the registry, and you can pin one from the chat panel. Settings can verify your key before you spend tokens." },
  { q: "What happens if I reject a change?",
    a: "Nothing is written. The rejection is recorded, the working tree stays as it was, and the agent waits for you to say what to do instead." },
  { q: "Can I undo something I approved?",
    a: "Yes. Each applied change is recorded in a journal with the text before and after, and you can revert any entry. Tasks also save checkpoints you can return to." },
  { q: "Where does my API key live?",
    a: "In the NVIDIA_API_KEY environment variable of the local service. It is never logged, returned by the API, or passed to commands the agent runs." },
  { q: "What does it cost?",
    a: "OWL runs on your own model key, so you pay your provider for the tokens you use. Every model call is recorded with input and output tokens." },
];

export function FaqSection() {
  return (
    <section className="section section-wash" id="faq">
      <div className="wrap faq-wrap">
        <div className="faq-side">
          <SectionHeading eyebrow="Questions" title="Straight answers." />
          <SiteLink className="faq-more" to="/docs">Read the docs <ArrowRight size={14} weight="bold" /></SiteLink>
        </div>
        <div className="faq">
          {FAQ_ENTRIES.map((entry) => (
            <details key={entry.q}>
              <summary>{entry.q}<Plus size={18} weight="bold" /></summary>
              <p>{entry.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
