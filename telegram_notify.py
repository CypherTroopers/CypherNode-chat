from typing import Optional
from telegram import Bot

class TelegramNotifier:
    def __init__(self, bot_token: str, chat_id: str, enabled: bool = True):
        self.enabled = enabled
        self.chat_id = chat_id
        self.bot: Optional[Bot] = Bot(token=bot_token) if enabled else None

    async def send(self, text: str) -> None:
        if not self.enabled or not self.bot:
            return
        await self.bot.send_message(chat_id=self.chat_id, text=text)
