import json
import urllib.request
from typing import Dict, Any, Optional

class OllamaLLM:
    def __init__(self, base_url: str, model: str, system_prompt: str):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.system_prompt = system_prompt

    def chat(self, user_text: str, tool_result: Optional[Dict[str, Any]] = None) -> str:
        prompt = self.system_prompt + "\n\n"
        if tool_result is not None:
            prompt += "Tool result (JSON):\n" + json.dumps(tool_result, ensure_ascii=False) + "\n\n"
        prompt += "User:\n" + user_text + "\nAssistant:\n"

        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False
        }

        req = urllib.request.Request(
            url=f"{self.base_url}/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("response", "").strip()
