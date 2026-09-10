# Security

The desktop backend listens only on loopback and uses per-session authentication, request tokens, Host/Origin checks and bounded requests. It is intended for a single user's local session, not public hosting. Other programs running as that user are outside its security boundary.

Do not post session URLs, tokens, environment dumps, personal paths or private videos in public issues. For a suspected vulnerability, use this repository's private GitHub vulnerability reporting feature if available. Otherwise open an issue requesting a private contact without including exploit details or sensitive data.

Reports should identify the affected version, operating system and minimal reproduction. Share sanitized logs only. Keep Chromium, Node.js, ffmpeg and npm dependencies updated through their supported distribution channels.
