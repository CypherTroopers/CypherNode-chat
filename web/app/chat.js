const answerEl = document.getElementById("answer");
const toolEl = document.getElementById("tool");
const questionInput = document.getElementById("q");

async function ask() {
  const q = questionInput.value.trim();
  if (!q) {
    questionInput.focus();
    return;
  }

  answerEl.textContent = "Thinking...";
  toolEl.textContent = "";

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q }),
    });
    const data = await response.json();
    answerEl.textContent = data.answer || "";
    toolEl.textContent = JSON.stringify(data.tool, null, 2);
  } catch (error) {
    answerEl.textContent = `Error: ${error}`;
  }
}

const clearChat = () => {
  questionInput.value = "";
  answerEl.textContent = "";
  toolEl.textContent = "";
};

export function setupChatActions() {
  document.getElementById("chat-send").addEventListener("click", ask);
  document.getElementById("chat-clear").addEventListener("click", clearChat);

  questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask();
    }
  });
}
