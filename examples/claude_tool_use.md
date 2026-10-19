# Управление моделью через Claude API

Claude получает описание инструмента `body_command`. Оно лежит в `Body.TOOL` в браузере или в `examples/body_tool.json`. Claude возвращает вызов инструмента, а ваша страница выполняет команды через `Body.run(...)` или `postMessage` в iframe с просмотрщиком.

```python
import json, anthropic

tool = json.load(open("examples/body_tool.json"))
client = anthropic.Anthropic()
msg = client.messages.create(
    model="claude-sonnet-5-5", max_tokens=1024, tools=[tool],
    messages=[{"role": "user", "content": "Покажи, как при наклоне вперёд работает поясничный отдел, вид сбоку"}],
)
for block in msg.content:
    if block.type == "tool_use" and block.name == "body_command":
        commands = block.input["commands"]      # -> отправить в страницу: Body.run(commands)
        print(json.dumps(commands, ensure_ascii=False, indent=2))
```

Пример ответа:
```json
[
  {"op": "peel", "to": "xray"},
  {"op": "pose", "preset": "forward_bend", "amount": 0.7},
  {"op": "highlight", "part": "поясничный"},
  {"op": "view", "angle": "left"},
  {"op": "focus", "part": "поясничный"}
]
```

Чтобы ИИ видела результат, верните ей `results` из `Body.run` (или из сообщения `body_result`) как `tool_result`.
