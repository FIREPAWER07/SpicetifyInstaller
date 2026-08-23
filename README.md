# 🎵 Spicetify Installer (By [FIREPAWER07](https://github.com/FIREPAWER07)) 🎵

[![Spicetify Installer Banner](https://i.imgur.com/OX06TY1.png)](https://github.com/FIREPAWER07/SpicetifyInstaller/releases/latest)

[![GitHub release](https://img.shields.io/github/release/FIREPAWER07/SpicetifyInstaller.svg)](https://github.com/FIREPAWER07/SpicetifyInstaller/releases/latest)
[![GitHub issues](https://img.shields.io/github/issues/FIREPAWER07/SpicetifyInstaller.svg)](https://github.com/FIREPAWER07/SpicetifyInstaller/issues)
[![License](https://img.shields.io/github/license/FIREPAWER07/SpicetifyInstaller.svg)](LICENSE)
[![Powered by Tauri](https://img.shields.io/badge/powered%20by-tauri-5f5fff.svg)](https://tauri.app/)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/D1D31CKA7D)

An **unofficial** Spicetify installer built with [Tauri](https://tauri.app/) for a seamless setup experience. This lightweight app automates the installation and configuration of [Spicetify](https://spicetify.app/), allowing you to customize your Spotify client with ease.

> **⚠ Disclaimer:** This project is **not affiliated, associated, or endorsed by Spicetify** or Spotify. Use at your own discretion.

---

## Table of Contents
- [Features](#-features)
- [Installation](#-installation)
- [Known Issues](#-known-issues)
- [Future Planned Updates](#-future-planned-updates)
- [Screenshots](#-screenshots)
- [Contributing](#-contributing)
- [License](#-license)
- [About the Developer](#-about-the-developer)
- [Support Me](#-support-me)
- [Stay Updated](#-stay-updated)

---

## 🚀 Features
- **Status-first control center** – see at a glance whether Spotify and Spicetify are installed, up to date, and backed up, plus the recommended next action.
- **One-click** Install / Update / Apply / Repair / Backup / Uninstall.
- **Native operations, no terminal** – downloads, extraction, and PATH setup are done directly in Rust. No hidden CMD/PowerShell scripts for normal use.
- **Real progress & control** – accurate download/extract progress, cancellation, automatic retries on network hiccups, and cleanup of partial files so your system is never left half-configured.
- **Friendly errors + technical logs** – clear messages up front, with a collapsible log view for advanced users.
- **Lightweight & Fast** – Powered by Tauri 🦀 with a React + Tailwind UI.
- **Accessible** – keyboard navigation, visible focus states, tooltips, and reduced-motion support.

---

## 🧱 Tech Stack
- **Backend:** Rust + Tauri 2 (native download/extract/registry, streaming progress, cancellation tokens).
- **Frontend:** React 18, TypeScript, Tailwind CSS v4, Framer Motion, react-icons.
- **Auto-update:** Tauri's official updater plugin, verifying signed releases against a public key.

---

## 🔄 Auto-Update & Releasing
The app updates itself through Tauri's updater, which reads the signed `latest.json`
manifest from this repo's latest GitHub release.

**One-time setup (already done):** a signing keypair was generated with
`bun run tauri signer generate`. The **public** key lives in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The **private** key must be
kept secret and added to the repository as GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY` – contents of the generated `.key` file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` – its password (empty if none)

**To ship an update:** bump the version in `src-tauri/tauri.conf.json` and
`Cargo.toml`, then push a tag:

```bash
git tag v2.1.0 && git push origin v2.1.0
```

The [release workflow](.github/workflows/release.yml) builds, signs, and publishes
the installer plus `latest.json`. Users get an in-app "Update app" prompt on next launch.

> ⚠️ If the private key is lost, published updates can no longer be signed and
> auto-update will break. Back it up securely.

---

## 🛠 Installation

### 📥 Download
Grab the latest release from the **[Releases](https://github.com/FIREPAWER07/SpicetifyInstaller/releases)** page.

### ▶ Run the Installer
- **Windows**: Run the `.exe` file.  
- *(macOS & Linux support coming soon!)*

---

## ❗ Known Issues
- Download speed depends on GitHub / your connection; the installer now streams with progress and retries, but very slow links are still slow.
- Windows only for now (macOS & Linux are on the roadmap).
---

## 🔮 Future Planned Updates!
- 🚀 **Linux and macOS support**
- 🧩 **Theme & extension management**
- ✨ **AND MUCH MORE!**

---

## 🖼 Screenshots
*Stay tuned – More visuals coming soon!*

---

## 🤝 Contributing
Contributions are welcome! If you have suggestions, find bugs, or want to improve the project:
- **Submit Issues:** [GitHub Issues](https://github.com/FIREPAWER07/SpicetifyInstaller/issues)
- **Pull Requests:** Fork the repo and send your improvements.

---

## 📜 License
This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for details.

---

## 💡 About the Developer
I'm a **beginner programmer** who started with no prior experience. I built this project with the help of amazing friends, a bit of AI assistance, and a lot of documentation. I’m excited to keep learning and refining my skills as I work on new updates!

---

## 💖 Support Me
If you appreciate my work and want to support the development of this project, consider buying me a coffee:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/D1D31CKA7D)

---

## ⚡ Stay Updated
Follow the repo and check the releases page for the latest updates. Thanks for supporting and happy customizing!

---

## ⚙️ Other Projects I've Made  

### 🔥 OmniKinkList  

<table>
  <tr>
    <td width="200">
      <a href="https://github.com/FIREPAWER07/OmniKinkList">
        <img src="https://i.imgur.com/aTl3wv5.png" alt="OmniKinkList Logo" width="180">
      </a>
    </td>
    <td>
      A modern, interactive web app designed for degenerates who want to explore, track, and share their personal preferences—with style, efficiency, and full customization.  
      <br><br>
      🔗 <a href="https://github.com/FIREPAWER07/OmniKinkList">Check it out here!</a>
      🔗 <a href="https://FIREPAWER07.github.io/OmniKinkList/">Check the Live Demo!</a>
    </td>
  </tr>
</table>

### 🖼️ SendDisImages

<table>
  <tr>
    <td width="200">
      <a href="https://github.com/FIREPAWER07/SendDisImages">
        <img src="https://i.imgur.com/t0W1fvu.png" alt="SendDisImages Logo" width="180">
      </a>
    </td>
    <td>
      A modern, lightweight desktop app that lets you easily send one or multiple high-quality images to Discord channels through your bot — with smart compression, Nitro mode support, and a clean, responsive UI.  
      <br><br>
      🔗 <a href="https://github.com/FIREPAWER07/SendDisImages">Check it out here!</a>
    </td>
  </tr>
</table>

