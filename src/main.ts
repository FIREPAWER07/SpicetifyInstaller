import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface SpicetifyCommand {
  name: string;
  command: string;
  description: string;
}

interface VersionInfo {
  installerVersion: string;
  spicetifyVersion: string | null;
  hasInstallerUpdate: boolean;
  hasSpicetifyUpdate: boolean;
}

class SpicetifyInstallerApp {
  private dropdownButton: HTMLElement;
  private dropdownMenu: HTMLElement;
  private dropdownIcon: HTMLElement;
  private selectedOptionText: HTMLElement;
  private commandDisplay: HTMLElement;
  private executeButton: HTMLButtonElement;
  private outputElement: HTMLElement;
  private outputCard: HTMLElement;
  private clearOutputButton: HTMLElement;
  private progressContainer: HTMLElement;
  private progressBar: HTMLElement;
  private progressPercentage: HTMLElement;
  private faqButton: HTMLElement;
  private faqModal: HTMLElement;
  private closeFaqButton: HTMLElement;
  private appVersionElement: HTMLElement;
  private spicetifyVersionElement: HTMLElement;
  private updateNotificationElement: HTMLElement;
  private footerVersionElement: HTMLElement;

  private selectedCommand: string | null = null;
  private isExecuting = false;
  private currentProgress = 0;
  private progressInterval: number | null = null;
  private progressListener: any = null;

  private commands: SpicetifyCommand[] = [
    {
      name: "INSTALL",
      command:
        "iwr -useb https://raw.githubusercontent.com/spicetify/spicetify-cli/master/install.ps1 | iex",
      description: "Installs or updates Spicetify CLI on your system",
    },
    {
      name: "REPAIR",
      command: "spicetify backup apply",
      description: "Restores from backup and applies Spicetify",
    },
    {
      name: "BACKUP",
      command: "spicetify backup",
      description: "Creates a backup of your Spotify installation",
    },
    {
      name: "UNINSTALL",
      command: "spicetify restore",
      description: "Restores Spotify to its original state",
    },
  ];

  constructor() {
    this.initElements();
    this.initEventListeners();

    this.runInitialDiagnostic();
  }

  private initElements(): void {
    this.dropdownButton = document.getElementById("dropdown-button")!;
    this.dropdownMenu = document.getElementById("dropdown-menu")!;
    this.dropdownIcon = document.getElementById("dropdown-icon")!;
    this.selectedOptionText = document.getElementById("selected-option")!;
    this.commandDisplay = document.getElementById("command-display")!;
    this.executeButton = document.getElementById(
      "execute-button"
    ) as HTMLButtonElement;
    this.outputElement = document.getElementById("output")!;
    this.outputCard = document.getElementById("output-card")!;
    this.clearOutputButton = document.getElementById("clear-output")!;
    this.progressContainer = document.getElementById("progress-container")!;
    this.progressBar = document.getElementById("progress-bar")!;
    this.progressPercentage = document.getElementById("progress-percentage")!;
    this.faqButton = document.getElementById("open-faq")!;
    this.faqModal = document.getElementById("faq-modal")!;
    this.closeFaqButton = document.getElementById("close-faq")!;
    this.appVersionElement = document.getElementById("app-version")!;
    this.spicetifyVersionElement =
      document.getElementById("spicetify-version")!;
    this.updateNotificationElement = document.getElementById(
      "update-notification"
    )!;
    this.footerVersionElement = document.getElementById("footer-version")!;

    this.appVersionElement.textContent = "Loading app version...";
    this.spicetifyVersionElement.textContent = "Checking Spicetify version...";
    this.footerVersionElement.textContent = "Loading...";
  }

  private initEventListeners(): void {
    this.dropdownButton.addEventListener("click", () => {
      this.toggleDropdown();
    });

    document.addEventListener("click", (event) => {
      if (
        !this.dropdownButton.contains(event.target as Node) &&
        !this.dropdownMenu.contains(event.target as Node)
      ) {
        this.closeDropdown();
      }
    });

    const dropdownItems = document.querySelectorAll(".dropdown-item");
    dropdownItems.forEach((item) => {
      item.addEventListener("click", () => {
        const command = (item as HTMLElement).dataset.command || "";
        const optionName = item.querySelector(".item-text")?.textContent || "";
        this.selectOption(optionName, command);
      });
    });

    this.executeButton.addEventListener("click", () => {
      if (!this.isExecuting) {
        this.executeCommand();
      }
    });

    this.clearOutputButton.addEventListener("click", () => {
      this.clearOutput();
    });

    this.faqButton.addEventListener("click", () => {
      this.openFaqUrl();
    });

    this.closeFaqButton.addEventListener("click", () => {
      this.closeFaqModal();
    });

    this.faqModal.addEventListener("click", (event) => {
      if (event.target === this.faqModal) {
        this.closeFaqModal();
      }
    });

    this.updateNotificationElement.addEventListener("click", () => {
      this.handleUpdateClick();
    });

    this.spicetifyVersionElement.addEventListener("click", () => {
      this.handleSpicetifyVersionClick();
    });
  }

  private async runInitialDiagnostic(): Promise<void> {
    try {
      this.outputCard.classList.remove("hidden");
      setTimeout(() => {
        this.outputCard.classList.add("visible");
      }, 10);

      this.outputElement.textContent = "";
      this.appendOutput("Diagnosing Spicetify installation...\n\n");

      const locationInfo = await invoke<string>("check_spicetify_location");
      this.appendOutput(locationInfo);

      try {
        const output = await invoke<string>("execute_powershell_command", {
          command:
            "try { spicetify -v } catch { Write-Output 'Command failed' }",
          options: {
            windowsVerbatimArguments: true,
            windowsHide: true,
          },
        });
        this.appendOutput("\nSpicetify version command output:\n" + output);
      } catch (error) {
        this.appendOutput("\nFailed to run spicetify command: " + error);
      }

      await this.checkVersions();
    } catch (error) {
      console.error("Diagnosis error:", error);
      this.appendOutput("\nDiagnosis failed: " + error);
      await this.checkVersions();
    }
  }

  private toggleDropdown(): void {
    const isHidden = !this.dropdownMenu.classList.contains("visible");

    if (isHidden) {
      this.openDropdown();
    } else {
      this.closeDropdown();
    }
  }

  private openDropdown(): void {
    this.dropdownMenu.classList.remove("hidden");
    setTimeout(() => {
      this.dropdownMenu.classList.add("visible");
    }, 10);
    this.dropdownIcon.textContent = "expand_less";
    this.dropdownIcon.classList.add("rotate");
  }

  private closeDropdown(): void {
    this.dropdownMenu.classList.remove("visible");
    setTimeout(() => {
      this.dropdownMenu.classList.add("hidden");
    }, 150);
    this.dropdownIcon.textContent = "expand_more";
    this.dropdownIcon.classList.remove("rotate");
  }

  private selectOption(optionName: string, command: string): void {
    this.selectedOptionText.textContent = optionName;
    this.selectedCommand = command;
    this.commandDisplay.textContent = `> ${command}`;
    this.executeButton.disabled = false;
    this.closeDropdown();
  }

  private async executeCommand(): Promise<void> {
    if (!this.selectedCommand || this.isExecuting) return;

    this.isExecuting = true;

    this.outputCard.classList.remove("hidden");
    setTimeout(() => {
      this.outputCard.classList.add("visible");
    }, 10);

    this.progressContainer.classList.remove("hidden");
    this.currentProgress = 0;
    this.updateProgressBar(0);

    this.executeButton.disabled = true;
    const originalButtonText = this.executeButton.innerHTML;
    this.executeButton.innerHTML = '<div class="loading"></div> Executing...';

    this.outputElement.textContent = "";

    this.appendOutput(`> ${this.selectedCommand}\n\n`);

    try {
      this.setupProgressListener();

      await this.executeCommandWithTauri(this.selectedCommand);

      this.completeProgress();

      this.appendOutput(
        "\n<span class='success-text'>[SUCCESS] Command executed successfully!</span>\n"
      );

      await this.checkVersions();
    } catch (error) {
      this.completeProgress();
      this.appendOutput(`\n<span class='error-text'>[ERROR] ${error}</span>\n`);
    } finally {
      this.executeButton.innerHTML = originalButtonText;
      this.executeButton.disabled = false;
      this.isExecuting = false;

      this.removeProgressListener();
    }
  }

  private async setupProgressListener(): Promise<void> {
    this.progressListener = await listen("progress_update", (event: any) => {
      const progress = event.payload as number;
      this.updateProgressBar(progress);
    });
  }

  private removeProgressListener(): void {
    if (this.progressListener) {
      this.progressListener();
      this.progressListener = null;
    }
  }

  private async executeCommandWithTauri(command: string): Promise<void> {
    try {
      console.log("Executing command:", command);
      const output = await invoke<string>("execute_powershell_command", {
        command,
      });
      console.log("Command output:", output);
      this.appendOutput(`[PowerShell Output]\n${output}\n`);
    } catch (error) {
      console.error("Error executing command:", error);
      throw new Error(`${error}`);
    }
  }

  private completeProgress(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    this.updateProgressBar(100);

    setTimeout(() => {
      this.progressContainer.classList.add("hidden");
    }, 1000);
  }

  private updateProgressBar(percentage: number): void {
    this.progressBar.style.width = `${percentage}%`;
    this.progressPercentage.textContent = `${Math.round(percentage)}%`;
  }

  private appendOutput(text: string): void {
    this.outputElement.innerHTML += text;
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  private clearOutput(): void {
    this.outputElement.textContent = "";
  }

  private async openFaqUrl(): Promise<void> {
    try {
      await invoke("open_faq_url");
    } catch (error) {
      console.error("Error opening FAQ URL:", error);
      this.openFaqModal();
    }
  }

  private openFaqModal(): void {
    this.faqModal.classList.remove("hidden");
    setTimeout(() => {
      this.faqModal.classList.add("visible");
    }, 10);
  }

  private closeFaqModal(): void {
    this.faqModal.classList.remove("visible");
    setTimeout(() => {
      this.faqModal.classList.add("hidden");
    }, 300);
  }

  private async checkVersions(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions");
      console.log("Version info received:", versionInfo);

      this.updateVersionUI(versionInfo);
    } catch (error) {
      console.error("Error checking versions:", error);
      this.appVersionElement.textContent = "App v1.0.0";
      this.spicetifyVersionElement.textContent = "Version check failed";
      this.footerVersionElement.textContent = "v1.0.0";
    }
  }

  private updateVersionUI(versionInfo: VersionInfo): void {
    const appVersion = versionInfo.installerVersion || "1.0.0";
    this.appVersionElement.textContent = `App v${appVersion}`;
    this.appVersionElement.classList.add("app-version-badge");
    this.footerVersionElement.textContent = `v${appVersion}`;

    if (versionInfo.spicetifyVersion) {
      const verMatch = versionInfo.spicetifyVersion.match(/\d+\.\d+\.\d+/);
      const cleanVersion = verMatch ? verMatch[0] : "Unknown version";

      this.spicetifyVersionElement.classList.remove(
        "success-text",
        "warning-text",
        "error-text"
      );

      if (versionInfo.hasSpicetifyUpdate) {
        this.spicetifyVersionElement.textContent = `Spicetify v${cleanVersion}`;
        this.spicetifyVersionElement.classList.add(
          "warning-text",
          "version-badge",
          "updatable"
        );
        this.spicetifyVersionElement.style.cursor = "pointer";
        this.spicetifyVersionElement.title =
          "Click to update to the latest version";
      } else {
        this.spicetifyVersionElement.textContent = `Spicetify v${cleanVersion}`;
        this.spicetifyVersionElement.classList.add(
          "success-text",
          "version-badge"
        );
        this.spicetifyVersionElement.style.cursor = "default";
        this.spicetifyVersionElement.title = "";
      }
    } else {
      this.spicetifyVersionElement.textContent = "Spicetify not installed";
      this.spicetifyVersionElement.classList.add("error-text", "version-badge");
      this.spicetifyVersionElement.classList.remove(
        "warning-text",
        "success-text",
        "updatable"
      );
      this.spicetifyVersionElement.style.cursor = "default";
      this.spicetifyVersionElement.title = "";
    }

    if (versionInfo.hasInstallerUpdate || versionInfo.hasSpicetifyUpdate) {
      this.updateNotificationElement.classList.remove("hidden");
      this.updateNotificationElement.classList.add("update-notification-badge");

      if (versionInfo.hasInstallerUpdate && versionInfo.hasSpicetifyUpdate) {
        this.updateNotificationElement.textContent =
          "App & Spicetify updates available!";
      } else if (versionInfo.hasInstallerUpdate) {
        this.updateNotificationElement.textContent = "App update available!";
      } else {
        this.updateNotificationElement.textContent =
          "Spicetify update available!";
      }
    } else {
      this.updateNotificationElement.classList.add("hidden");
    }
  }

  private async handleUpdateClick(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions");

      if (versionInfo.hasSpicetifyUpdate) {
        this.selectOption("INSTALL", this.commands[0].command);

        await this.executeCommand();
      } else if (versionInfo.hasInstallerUpdate) {
        if (
          confirm(
            "An update for the Spicetify Installer is available. Would you like to download it now?"
          )
        ) {
          await invoke("open_download_url");
        }
      }
    } catch (error) {
      console.error("Error handling update:", error);
      alert("Failed to process update. Please try again later.");
    }
  }

  private async handleSpicetifyVersionClick(): Promise<void> {
    try {
      const versionInfo = await invoke<VersionInfo>("check_versions");

      if (versionInfo.hasSpicetifyUpdate) {
        if (
          confirm(
            "A newer version of Spicetify is available. Would you like to update now?"
          )
        ) {
          this.selectOption("INSTALL", this.commands[0].command);

          await this.executeCommand();
        }
      }
    } catch (error) {
      console.error("Error handling Spicetify version click:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SpicetifyInstallerApp();
});
