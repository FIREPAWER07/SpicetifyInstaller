import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  downloadUrl: string
  updateAvailable: boolean
}

export interface UpdateProgress {
  stage: string
  progress: number
  message: string
}

export class UpdateManager {
  private updateModal: HTMLElement | null = null
  private progressCallback: ((progress: UpdateProgress) => void) | null = null

  constructor() {
    this.createUpdateModal()
    this.setupEventListeners()
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      const updateInfo = await invoke<UpdateInfo>("check_for_app_updates")
      return updateInfo
    } catch (error) {
      console.error("Failed to check for updates:", error)
      return null
    }
  }

  async showUpdateDialog(updateInfo: UpdateInfo): Promise<boolean> {
    console.log("showUpdateDialog called with:", updateInfo)

    return new Promise((resolve) => {
      if (!this.updateModal) {
        console.log("Creating update modal...")
        this.createUpdateModal()
      }

      const modal = this.updateModal!
      console.log("Modal element:", modal)

      const title = modal.querySelector("#update-modal-title") as HTMLElement
      const message = modal.querySelector("#update-modal-message") as HTMLElement
      const updateBtn = modal.querySelector("#update-download-btn") as HTMLButtonElement
      const cancelBtn = modal.querySelector("#update-cancel-btn") as HTMLButtonElement

      console.log("Modal elements found:", { title, message, updateBtn, cancelBtn })

      if (!title || !message || !updateBtn || !cancelBtn) {
        console.error("Modal elements not found!")
        resolve(false)
        return
      }

      // Clear any existing event listeners by cloning nodes
      const newUpdateBtn = updateBtn.cloneNode(true) as HTMLButtonElement
      const newCancelBtn = cancelBtn.cloneNode(true) as HTMLButtonElement
      updateBtn.parentNode?.replaceChild(newUpdateBtn, updateBtn)
      cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn)

      console.log("Event listeners cleared and buttons replaced")

      title.textContent = "Installer Update Available"
      message.innerHTML = `
      <div class="update-info-container">
        <div class="update-icon">
          <span class="material-icons">system_update</span>
        </div>
        <div class="update-details">
          <p class="update-intro">A new version of the Spicetify Installer is available!</p>
          <div class="version-comparison">
            <div class="current-version">
              <span class="version-label">Current version:</span>
              <span class="version-value">v${updateInfo.currentVersion}</span>
            </div>
            <div class="version-arrow">
              <span class="material-icons">arrow_forward</span>
            </div>
            <div class="latest-version">
              <span class="version-label">Latest version:</span>
              <span class="version-value">v${updateInfo.latestVersion}</span>
            </div>
          </div>
          <p class="update-benefits">
            This update includes bug fixes, performance improvements, and new features.
            The application will automatically restart after the update is complete.
          </p>
        </div>
      </div>
    `

      const handleUpdate = async () => {
        console.log("Update button clicked, starting download...")

        newUpdateBtn.disabled = true
        newCancelBtn.disabled = true
        newUpdateBtn.innerHTML = `
        <div class="loading"></div>
        <span>Downloading...</span>
      `

        try {
          console.log("Calling downloadAndInstallUpdate with URL:", updateInfo.downloadUrl)
          await this.downloadAndInstallUpdate(updateInfo.downloadUrl)
          console.log("Update completed successfully")
          resolve(true)
        } catch (error) {
          console.error("Update failed:", error)
          this.showUpdateError(error as string)

          // Re-enable buttons on error
          newUpdateBtn.disabled = false
          newCancelBtn.disabled = false
          newUpdateBtn.innerHTML = `
        <span class="material-icons">refresh</span>
        Try Again
      `
          resolve(false)
        }
      }

      const handleCancel = () => {
        console.log("Update cancelled by user")
        this.closeUpdateModal()
        resolve(false)
      }

      // Add event listeners to the new buttons
      console.log("Adding event listeners to buttons")
      newUpdateBtn.addEventListener("click", handleUpdate)
      newCancelBtn.addEventListener("click", handleCancel)

      // Show modal
      console.log("Showing modal...")
      document.body.classList.add("modal-open")
      modal.classList.remove("hidden")

      requestAnimationFrame(() => {
        modal.classList.add("visible")
        console.log("Modal should now be visible")
      })
    })
  }

  private async downloadAndInstallUpdate(downloadUrl: string): Promise<void> {
    try {
      console.log("Starting update download and installation...")
      console.log("Download URL:", downloadUrl)

      const result = await invoke("download_and_install_update", {
        downloadUrl: downloadUrl,
      })

      console.log("Update command completed:", result)
    } catch (error) {
      console.error("Update command failed:", error)
      throw new Error(`Update failed: ${error}`)
    }
  }

  private showUpdateError(error: string): void {
    const modal = this.updateModal!
    const message = modal.querySelector("#update-modal-message") as HTMLElement
    const updateBtn = modal.querySelector("#update-download-btn") as HTMLButtonElement
    const cancelBtn = modal.querySelector("#update-cancel-btn") as HTMLButtonElement

    message.innerHTML = `
      <div class="update-info-container">
        <div class="update-icon warning-icon">
          <span class="material-icons">error</span>
        </div>
        <div class="update-details">
          <p class="update-intro error-text">Update Failed</p>
          <p class="update-benefits">
            ${error}
          </p>
          <p class="update-benefits">
            You can try again later or download the update manually from GitHub.
          </p>
        </div>
      </div>
    `

    updateBtn.innerHTML = `
      <span class="material-icons">refresh</span>
      Try Again
    `
    updateBtn.disabled = false
    cancelBtn.disabled = false
    cancelBtn.textContent = "Close"
  }

  private closeUpdateModal(): void {
    if (this.updateModal) {
      document.body.classList.remove("modal-open")
      this.updateModal.classList.remove("visible")
      setTimeout(() => {
        this.updateModal!.classList.add("hidden")
      }, 300)
    }
  }

  private createUpdateModal(): void {
    console.log("createUpdateModal called")

    // Remove any existing modal first
    const existingModal = document.getElementById("update-modal")
    if (existingModal) {
      console.log("Removing existing modal")
      existingModal.remove()
    }

    const modal = document.createElement("div")
    modal.id = "update-modal"
    modal.className = "modal hidden"

    modal.innerHTML = `
      <div class="modal-content update-modal-content">
        <div class="modal-header">
          <h2 id="update-modal-title">Update Available</h2>
          <button id="close-update-modal" class="close-button">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div id="update-modal-message">An update is available.</div>
          <div class="update-actions">
            <button id="update-download-btn" class="update-btn">
              <span class="material-icons">download</span>
              Download & Install
            </button>
            <button id="update-cancel-btn" class="cancel-btn">
              <span class="material-icons">close</span>
              Cancel
            </button>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(modal)
    console.log("Modal appended to body")

    const closeBtn = modal.querySelector("#close-update-modal")
    closeBtn?.addEventListener("click", () => {
      console.log("Close button clicked")
      this.closeUpdateModal()
    })

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        console.log("Modal backdrop clicked")
        this.closeUpdateModal()
      }
    })

    this.updateModal = modal
    console.log("Update modal created and stored")
  }

  private async setupEventListeners(): Promise<void> {
    await listen("update_progress", (event) => {
      const progress = event.payload as UpdateProgress
      if (this.progressCallback) {
        this.progressCallback(progress)
      }
      console.log(`Update progress: ${progress.stage} - ${progress.progress}% - ${progress.message}`)
    })
  }

  setProgressCallback(callback: (progress: UpdateProgress) => void): void {
    this.progressCallback = callback
  }
}
