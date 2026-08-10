# Lucky Five

A remote two-player Yahtzee single-page app built with HTML, CSS, and JavaScript. Each completed turn creates a shareable URL containing the scored game history, so no server or account is required.

## Play remotely

1. Player One completes and scores a turn.
2. Copy the generated game link and send it to Player Two.
3. Player Two opens the link, takes a turn, and sends the new link back.
4. Continue exchanging links until the final score is recorded.

The game payload is Base64URL-encoded and protected by a SHA-256 checksum. It is portable rather than secret: anyone with the URL can view the game, and no game data is stored on a server.

## Run locally

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Publish with GitHub Pages

1. Push this project to a GitHub repository using `main` as the default branch.
2. Open the repository's **Settings > Pages** page.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually.

The workflow publishes the site at `https://<username>.github.io/<repository>/`.
