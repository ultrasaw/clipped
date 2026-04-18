# Clipped

Prototype for a social deduction chat game where humans try to recognize each
other inside a room of AI participants.

## Run The Chat Prototype

Requirements:

- Node.js 20 or newer

Start the server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

Open the page in two browser tabs to test the live chat loop.

## Current Scope

This first slice is intentionally simple:

- Static browser client
- Node HTTP server
- Server-Sent Events for live message updates
- In-memory chat history
- No database
- No login
- No AI behavior yet
