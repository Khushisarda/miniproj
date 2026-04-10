# LeetSeek

A LeetCode tracking API that fetches user stats and stores them in Firebase Firestore.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `?username=user` | Add/fetch a new LeetCode user |
| `?username=user&source=get` | Get stored data for a user |
| `?source=list` | Get all tracked users |
| `?source=cron` | Trigger daily update (auto via Vercel cron) |

## Web Frontend

A modern web UI is included in the `web/` folder. Deploy it alongside the API or separately.

## Linked Clients

- Android client → https://github.com/sinha-i-prefer/LeetGeek-A
- Discord client → https://github.com/sinha-i-prefer/LeetGeek-D
