# Deploying the landing page — new EC2 server

The landing is static HTML (no build step). We put it on a small EC2 instance behind
Caddy, which handles automatic HTTPS. ~5 minutes of setup.

## 0. What you need
- A domain (or subdomain) for the landing, e.g. `www.lettersheets.app` or `get.lettersheets.app`.
- An AWS account with permission to launch EC2.

## 1. Launch the instance
- **AMI:** Ubuntu 24.04 LTS (or Amazon Linux 2023).
- **Type:** `t3.micro` is plenty for a static site (free-tier eligible).
- **Key pair:** create/download one — you'll SSH with it.
- **Security group — inbound rules:**
  - `22/tcp` from your IP (SSH)
  - `80/tcp` from anywhere (HTTP → redirects to HTTPS)
  - `443/tcp` from anywhere (HTTPS)
- Note the instance's **public IP / DNS**.

## 2. Point DNS at it
Create an **A record** for your landing domain → the instance's public IP.
(Wait for it to resolve before step 4, or Caddy's cert request will fail.)

## 3. Install Caddy + create the web root
SSH in (`ssh -i your-key.pem ubuntu@<public-ip>`), then:

```bash
# Install Caddy (Ubuntu)
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy rsync

# Web root the deploy script uploads to
sudo mkdir -p /srv/landing
sudo chown -R "$USER":"$USER" /srv/landing
```

## 4. Configure Caddy
Copy `landing/Caddyfile` from this repo to `/etc/caddy/Caddyfile` on the server,
then set your domain and reload:

```bash
# on the server — set the domain Caddy should serve + get a cert for
sudo sed -i 's/{$LANDING_DOMAIN}/www.lettersheets.app/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
(Replace `www.lettersheets.app` with your domain.)

## 5. Upload the pages (from your Mac, in the repo)
```bash
cd landing
SERVER=ubuntu@<public-ip> KEY=~/.ssh/your-key.pem ./deploy.sh
```
Re-run this any time you change the HTML — it rsyncs the 5 pages up.

## 6. Verify
Open `https://<your-domain>` — you should see the landing with a valid certificate.

---

## Point "Sign in" / "Get started" at your app
By default those links go to `/`. For a standalone landing, either:
- **Quick:** share the URL with `?app=https://erp.example.com` — the page rewrites the links, **or**
- **Permanent:** in each HTML file, change the line
  `var appUrl = new URLSearchParams(location.search).get('app') || '/';`
  to `... || 'https://erp.example.com';`
  (tell me your ERP app URL and I'll bake it in before you deploy).
