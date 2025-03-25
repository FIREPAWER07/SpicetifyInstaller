import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event";

interface SpicetifyCommand {
  name: string
  command: string
  description: string
}

interface VersionInfo {
  installerVersion: string
  spicetifyVersion: string | null
  hasInstallerUpdate: boolean
  hasSpicetifyUpdate: boolean
}

class SpicetifyInstallerApp {
  private dropdownButton: HTMLElement
  private dropdownMenu: HTMLElement
  private dropdownIcon: HTMLElement
  private selectedOptionText: HTMLElement
  private commandDisplay: HTMLElement
  private executeButton: HTMLButtonElement
  private outputElement: HTMLElement
  private outputCard: HTMLElement
  private clearOutputButton: HTMLElement
  private progressContainer: HTMLElement
  private progressBar: HTMLElement
  private progressPercentage: HTMLElement
  private faqButton: HTMLElement
  private faqModal: HTMLElement
  private closeFaqButton: HTMLElement
  private appVersionElement: HTMLElement
  private spicetifyVersionElement: HTMLElement
  private updateNotificationElement: HTMLElement
  private footerVersionElement: HTMLElement

  private selectedCommand: string | null = null
  private isExecuting = false
  private currentProgress = 0
  private progressInterval: number | null = null
  private progressListener: any = null

  private commands: SpicetifyCommand[] = [
    {
      name: "INSTALL",
      command: "iwr -useb https://raw.githubusercontent.com/spicetify/spicetify-cli/master/install.ps1 | iex",
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
  ]

  constructor() {
    this.initElements()
    this.initEventListeners()

    // Run diagnostic and version check on startup
    this.runInitialDiagnostic()
  }

  private initElements(): void {
    this.dropdownButton = document.getElementById("dropdown-button")!
    this.dropdownMenu = document.getElementById("dropdown-menu")!
    this.dropdownIcon = document.getElementById("dropdown-icon")!
    this.selectedOptionText = document.getElementById("selected-option")!
    this.commandDisplay = document.getElementById("command-display")!
    this.executeButton = document.getElementById("execute-button") as HTMLButtonElement
    this.outputElement = document.getElementById("output")!
    this.outputCard = document.getElementById("output-card")!
    this.clearOutputButton = document.getElementById("clear-output")!
    this.progressContainer = document.getElementById("progress-container")!
    this.progressBar = document.getElementById("progress-bar")!
    this.progressPercentage = document.getElementById("progress-percentage")!
    this.faqButton = document.getElementById("open-faq")!
    this.faqModal = document.getElementById("faq-modal")!
    this.closeFaqButton = document.getElementById("close-faq")!
    this.appVersionElement = document.getElementById("app-version")!
    this.spicetifyVersionElement = document.getElementById("spicetify-version")!
    this.updateNotificationElement = document.getElementById("update-notification")!
    this.footerVersionElement = document.getElementById("footer-version")!

    // Set initial version display while loading
    this.appVersionElement.textContent = "Loading app version..."
    this.spicetifyVersionElement.textContent = "Checking Spicetify version..."
    this.footerVersionElement.textContent = "Loading..."
  }

  private initEventListeners(): void {
    // Toggle dropdown menu
    this.dropdownButton.addEventListener("click", () => {
      this.toggleDropdown()
    })

    // Close dropdown when clicking outside
    document.addEventListener("click", (event) => {
      if (!this.dropdownButton.contains(event.target as Node) && !this.dropdownMenu.contains(event.target as Node)) {
        this.closeDropdown()
      }
    })

    // Handle option selection
    const dropdownItems = document.querySelectorAll(".dropdown-item")
    dropdownItems.forEach((item) => {
      item.addEventListener("click", () => {
        const command = (item as HTMLElement).dataset.command || ""
        const optionName = item.querySelector(".item-text")?.textContent || ""
        this.selectOption(optionName, command)
      })
    })

    // Execute command button
    this.executeButton.addEventListener("click", () => {
      if (!this.isExecuting) {
        this.executeCommand()
      }
    })

    // Clear output button
    this.clearOutputButton.addEventListener("click", () => {
      this.clearOutput()
    })

    // FAQ button
    this.faqButton.addEventListener("click", () => {
      this.openFaqUrl()
    })

    // Close FAQ button
    this.closeFaqButton.addEventListener("click", () => {
      this.closeFaqModal()
    })

    // Close FAQ modal when clicking outside
    this.faqModal.addEventListener("click", (event) => {
      if (event.target === this.faqModal) {
        this.closeFaqModal()
      }
    })

    // Add click event for update notification
    this.updateNotificationElement.addEventListener("click", () => {
      this.handleUpdateClick()
    })

    // Add click event for Spicetify version element
    this.spicetifyVersionElement.addEventListener("click", () => {
      this.handleSpicetifyVersionClick()
    })
  }

  private async runInitialDiagnostic(): Promise<void> {
    try {
      // Show the output card
      this.outputCard.classList.remove("hidden")
      setTimeout(() => {
        this.outputCard.classList.add("visible")
      }, 10)

      // Clear previous output
      this.outputElement.textContent = ""
      this.appendOutput("Diagnosing Spicetify installation...\n\n")

      // Get Spicetify location information
      const locationInfo = await invoke<string>("check_spicetify_location")
      this.appendOutput(locationInfo)

      // Try to run spicetify directly
      try {
        const output = await invoke<string>("execute_powershell_command", {
          command: "try { spicetify -v } catch { Write-Output 'Command failed' }",
        })
        this.appendOutput("\nSpicetify version command output:\n" + output)
      } catch (error) {
        this.appendOutput("\nFailed to run spicetify command: " + error)
      }

      // Check PATH environment variable
      await this.checkVersions()
    } catch (error) {
      console.error("Diagnosis error:", error)
      this.appendOutput("\nDiagnosis failed: " + error)

      // Still try to check versions even if diagnostic fails
      await this.checkVersions()
    }
  }

  private toggleDropdown(): void {
    const isHidden = !this.dropdownMenu.classList.contains("visible")

    if (isHidden) {
      this.openDropdown()
    } else {
      this.closeDropdown()
    }
  }
  

  private openDropdown(): void {
    this.dropdownMenu.classList.remove("hidden")
    // Use setTimeout to ensure the transition works
    setTimeout(() => {
      this.dropdownMenu.classList.add("visible")
    }, 10)
    this.dropdownIcon.textContent = "expand_less"
    this.dropdownIcon.classList.add("rotate")
  }

  private closeDropdown(): void {
    this.dropdownMenu.classList.remove("visible");
    // Reduce delay for better UX
    setTimeout(() => {
      this.dropdownMenu.classList.add("hidden");
    }, 150); // Reduced from 300ms
    this.dropdownIcon.textContent = "expand_more";
    this.dropdownIcon.classList.remove("rotate");
  }

  private selectOption(optionName: string, command: string): void {
    this.selectedOptionText.textContent = optionName
    this.selectedCommand = command
    this.commandDisplay.textContent = `> ${command}`
    this.executeButton.disabled = false
    this.closeDropdown()
  }

  private async executeCommand(): Promise<void> {
    if (!this.selectedCommand || this.isExecuting) return

    this.isExecuting = true

    // Show the output card
    this.outputCard.classList.remove("hidden")
    setTimeout(() => {
      this.outputCard.classList.add("visible")
    }, 10)

    // Show progress bar
    this.progressContainer.classList.remove("hidden")
    this.currentProgress = 0
    this.updateProgressBar(0)

    // Show loading state
    this.executeButton.disabled = true
    const originalButtonText = this.executeButton.innerHTML
    this.executeButton.innerHTML = '<div class="loading"></div> Executing...'

    // Clear previous output
    this.outputElement.textContent = ""

    // Log the command
    this.appendOutput(`> ${this.selectedCommand}\n\n`)

    try {
      // Setup progress listener
      this.setupProgressListener()

      // Execute the command using Tauri
      await this.executeCommandWithTauri(this.selectedCommand)

      // Complete the progress
      this.completeProgress()

      // Add success message
      this.appendOutput("\n<span class='success-text'>[SUCCESS] Command executed successfully!</span>\n")

      // Refresh version info after command execution
      await this.checkVersions()
    } catch (error) {
      // Handle error
      this.completeProgress()
      this.appendOutput(`\n<span class='error-text'>[ERROR] ${error}</span>\n`)
    } finally {
      // Reset button after execution
      this.executeButton.innerHTML = originalButtonText
      this.executeButton.disabled = false
      this.isExecuting = false

      // Remove progress listener
      this.removeProgressListener()
    }
  }

  private async setupProgressListener(): Promise<void> {
    this.progressListener = await listen("progress_update", (event: any) => {
      const progress = event.payload as number;
      this.updateProgressBar(progress);
    });
  }

  private removeProgressListener(): void {
    // Remove progress listener if it exists
    if (this.progressListener) {
      this.progressListener()
      this.progressListener = null
    }
  }

  private async executeCommandWithTauri(command: string): Promise<void> {
    try {
      console.log("Executing command:", command)
      const output = await invoke<string>("execute_powershell_command", {
        command,
      })
      console.log("Command output:", output)
      this.appendOutput(`[PowerShell Output]\n${output}\n`)
    } catch (error) {
      console.error("Error executing command:", error)
      throw new Error(`${error}`)
    }
  }

  private completeProgress(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }

    // Complete the progress to 100%
    this.updateProgressBar(100)

    // Hide progress bar after a delay
    setTimeout(() => {
      this.progressContainer.classList.add("hidden")
    }, 1000)
  }

  private updateProgressBar(percentage: number): void {
    this.progressBar.style.width = `${percentage}%`
    this.progressPercentage.textContent = `${Math.round(percentage)}%`
  }

  private appendOutput(text: string): void {
    this.outputElement.innerHTML += text
    // Auto-scroll to bottom
    this.outputElement.scrollTop = this.outputElement.scrollHeight
  }

  private clearOutput(): void {
    this.outputElement.textContent = ""
  }

  private async openFaqUrl(): Promise<void> {
    try {
      // Use Tauri command to open the FAQ URL
      await invoke("open_faq_url")
    } catch (error) {
      console.error("Error opening FAQ URL:", error)
      // Fallback to opening the modal if the command fails
      this.openFaqModal()
    }
  }

  private openFaqModal(): void {
    this.faqModal.classList.remove("hidden")
    setTimeout(() => {
      this.faqModal.classList.add("visible")
    }, 10)
  }

  private closeFaqModal(): void {
    this.faqModal.classList.remove("visible")
    setTimeout(() => {
      this.faqModal.classList.add("hidden")
    }, 300)
  }

  private async checkVersions(): Promise<void> {
    try {
      // Get actual version information from Tauri
      const versionInfo = await invoke<VersionInfo>("check_versions")
      console.log("Version info received:", versionInfo)

      // Update UI with version information
      this.updateVersionUI(versionInfo)
    } catch (error) {
      console.error("Error checking versions:", error)
      // Set fallback values if version check fails
      this.appVersionElement.textContent = "App v1.0.0"
      this.spicetifyVersionElement.textContent = "Version check failed"
      this.footerVersionElement.textContent = "v1.0.0"
    }
  }

  private updateVersionUI(versionInfo: VersionInfo): void {
    // Update app version - ensure we have a valid version string
    const appVersion = versionInfo.installerVersion || "1.0.0"
    this.appVersionElement.textContent = `App v${appVersion}`
    this.appVersionElement.classList.add("app-version-badge")
    this.footerVersionElement.textContent = `v${appVersion}`

    // Update Spicetify version - make sure we're checking correctly
    if (versionInfo.spicetifyVersion) {
      const verMatch = versionInfo.spicetifyVersion.match(/\d+\.\d+\.\d+/)
      const cleanVersion = verMatch ? verMatch[0] : "Unknown version"

      // Reset classes first
      this.spicetifyVersionElement.classList.remove("success-text", "warning-text", "error-text")

      if (versionInfo.hasSpicetifyUpdate) {
        this.spicetifyVersionElement.textContent = `Spicetify v${cleanVersion}`
        this.spicetifyVersionElement.classList.add("warning-text", "version-badge", "updatable")
        this.spicetifyVersionElement.style.cursor = "pointer"
        this.spicetifyVersionElement.title = "Click to update to the latest version"
      } else {
        this.spicetifyVersionElement.textContent = `Spicetify v${cleanVersion}`
        this.spicetifyVersionElement.classList.add("success-text", "version-badge")
        this.spicetifyVersionElement.style.cursor = "default"
        this.spicetifyVersionElement.title = ""
      }
    } else {
      this.spicetifyVersionElement.textContent = "Spicetify not installed"
      this.spicetifyVersionElement.classList.add("error-text", "version-badge")
      this.spicetifyVersionElement.classList.remove("warning-text", "success-text", "updatable")
      this.spicetifyVersionElement.style.cursor = "default"
      this.spicetifyVersionElement.title = ""
    }

    // Update notification element visibility
    if (versionInfo.hasInstallerUpdate || versionInfo.hasSpicetifyUpdate) {
      this.updateNotificationElement.classList.remove("hidden")
      this.updateNotificationElement.classList.add("update-notification-badge")

      // Update the notification text to be more descriptive
      if (versionInfo.hasInstallerUpdate && versionInfo.hasSpicetifyUpdate) {
        this.updateNotificationElement.textContent = "App & Spicetify updates available!"
      } else if (versionInfo.hasInstallerUpdate) {
        this.updateNotificationElement.textContent = "App update available!"
      } else {
        this.updateNotificationElement.textContent = "Spicetify update available!"
      }
    } else {
      this.updateNotificationElement.classList.add("hidden")
    }
  }

  private async handleUpdateClick(): Promise<void> {
    try {
      // Get version info to determine what needs updating
      const versionInfo = await invoke<VersionInfo>("check_versions")

      if (versionInfo.hasSpicetifyUpdate) {
        // Select the INSTALL option which updates Spicetify
        this.selectOption("INSTALL", this.commands[0].command)

        // Execute the command
        await this.executeCommand()
      } else if (versionInfo.hasInstallerUpdate) {
        // For app updates, show a confirmation dialog
        if (confirm("An update for the Spicetify Installer is available. Would you like to download it now?")) {
          // Open the download page in the browser
          await invoke("open_download_url")
        }
      }
    } catch (error) {
      console.error("Error handling update:", error)
      alert("Failed to process update. Please try again later.")
    }
  }

  private async handleSpicetifyVersionClick(): Promise<void> {
    try {
      // Get version info to determine if an update is available
      const versionInfo = await invoke<VersionInfo>("check_versions")

      if (versionInfo.hasSpicetifyUpdate) {
        // Show confirmation dialog
        if (confirm("A newer version of Spicetify is available. Would you like to update now?")) {
          // Select the INSTALL option which updates Spicetify
          this.selectOption("INSTALL", this.commands[0].command)

          // Execute the command
          await this.executeCommand()
        }
      }
    } catch (error) {
      console.error("Error handling Spicetify version click:", error)
    }
  }
}

// Initialize the application when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  new SpicetifyInstallerApp()
})

