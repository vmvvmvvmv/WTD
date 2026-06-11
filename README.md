# WeatherToDo

WeatherToDo mobile app and the Django backend endpoints used by the mobile app.

## Structure

- `mobile/`: React Native + Expo Android app.
- `backend/`: Django backend for weather, dust, notifications, and mobile map WebView.

## Security Notes

- Do not commit `.env`, API keys, Firebase service account files, SSH keys, DB dumps, or local logs.
- Use `.env.example` files or deployment notes for required environment variable names.
- Production mobile builds should use an HTTPS backend URL, not `127.0.0.1` or `adb reverse`.
