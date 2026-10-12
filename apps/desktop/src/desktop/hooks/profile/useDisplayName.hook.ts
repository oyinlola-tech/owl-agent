import { useEffect, useState } from "react";
import { agentApi } from "../../services/agentApi.service";

export function useDisplayName(): string {
  const [name, setName] = useState("");
  useEffect(() => {
    let alive = true;
    agentApi.profile()
      .then((profile) => { if (alive) setName(profile.display_name.trim()); })
      .catch(() => { if (alive) setName(""); });
    return () => { alive = false; };
  }, []);
  return name;
}
