import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  downloadUrl: string
  updateAvailable: boolean
}

export interface SpicetifyUpdateInfo {
  current_version: string
  latest_version: string
  download_url: string
  update_available: boolean
}

export interface UpdateProgress {
  stage: string
  progress: number
  message: string
}

export class UpdateManager {
  private updateModal: HTMLElement | null = null
  private spicetifyUpdateModal: HTMLElement | null = null
  private progressCallback: ((progress: UpdateProgress) => void) | null = null
  private isTauriAvailable = false
  private spicetifyProgressListener: any = null

  constructor() {
    this.checkTauriAvailability()
    if (this.isTauriAvailable) {
      this.createUpdateModal()
      this.createSpicetifyUpdateModal()
      this.setupEventListeners()
    }
  }

  private checkTauriAvailability(): void {
    try {
      this.isTauriAvailable = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
      if (!this.isTauriAvailable) {
        console.warn("[UpdateManager] Tauri runtime not available - running in preview mode")
      }
    } catch (error) {
      console.warn("[UpdateManager] Error checking Tauri availability:", error)
      this.isTauriAvailable = false
    }
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (!this.isTauriAvailable) {
      console.warn("[UpdateManager] Cannot check for updates - Tauri not available")
      return null
    }

    try {
      const updateInfo = await invoke<UpdateInfo>("check_for_app_updates")
      return updateInfo
    } catch (error) {
      console.error("Failed to check for updates:", error)
      return null
    }
  }

  async checkForSpicetifyUpdates(): Promise<SpicetifyUpdateInfo | null> {
    if (!this.isTauriAvailable) {
      console.warn("[UpdateManager] Cannot check for Spicetify updates - Tauri not available")
      return null
    }

    try {
      const updateInfo = await invoke<SpicetifyUpdateInfo>("check_for_spicetify_updates")
      return updateInfo
    } catch (error) {
      console.error("Failed to check for Spicetify updates:", error)
      return null
    }
  }

  async showSpicetifyUpdateDialog(updateInfo: SpicetifyUpdateInfo): Promise<boolean> {
    console.log("showSpicetifyUpdateDialog called with:", updateInfo)

    return new Promise((resolve) => {
      if (!this.spicetifyUpdateModal) {
        console.log("Creating Spicetify update modal...")
        this.createSpicetifyUpdateModal()
      }

      const modal = this.spicetifyUpdateModal!
      const title = modal.querySelector("#spicetify-update-modal-title") as HTMLElement
      const message = modal.querySelector("#spicetify-update-modal-message") as HTMLElement
      const updateBtn = modal.querySelector("#spicetify-update-download-btn") as HTMLButtonElement
      const cancelBtn = modal.querySelector("#spicetify-update-cancel-btn") as HTMLButtonElement

      if (!title || !message || !updateBtn || !cancelBtn) {
        console.error("Spicetify modal elements not found!")
        resolve(false)
        return
      }

      const newUpdateBtn = updateBtn.cloneNode(true) as HTMLButtonElement
      const newCancelBtn = cancelBtn.cloneNode(true) as HTMLButtonElement
      updateBtn.parentNode?.replaceChild(newUpdateBtn, updateBtn)
      cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn)

      title.textContent = "Spicetify Update Available"
      message.innerHTML = `
        <div class="update-info-container">
          <div class="update-icon">
            <span class="material-icons">system_update</span>
          </div>
          <div class="update-details">
            <p class="update-intro">A new version of Spicetify CLI is available!</p>
            <div class="version-comparison">
              <div class="current-version">
                <span class="version-label">Current version:</span>
                <span class="version-value">v${updateInfo.current_version}</span>
              </div>
              <div class="version-arrow">
                <span class="material-icons">arrow_forward</span>
              </div>
              <div class="latest-version">
                <span class="version-label">Latest version:</span>
                <span class="version-value">v${updateInfo.latest_version}</span>
              </div>
            </div>
            <p class="update-benefits">
              This update includes bug fixes, performance improvements, and new features for Spicetify CLI.
            </p>
          </div>
        </div>
      `

      const handleUpdate = async () => {
        console.log("Spicetify update button clicked, starting installation...")

        newUpdateBtn.disabled = true
        newCancelBtn.disabled = true

        newUpdateBtn.innerHTML = `
          <div class="loading"></div>
          <span>Installing...</span>
          <div class="button-progress-bar" id="spicetify-progress-bar"></div>
          <div class="button-progress-percentage" id="spicetify-progress-percentage">0%</div>
        `
        newUpdateBtn.classList.add("executing")

        try {
          await this.setupSpicetifyProgressListener()

          await this.installSpicetifyUpdate()
          console.log("Spicetify update completed successfully")

          this.removeSpicetifyProgressListener()

          this.closeSpicetifyUpdateModal()
          resolve(true)
        } catch (error) {
          console.error("Spicetify update failed:", error)

          this.removeSpicetifyProgressListener()

          this.showSpicetifyUpdateError(error as string)
          newUpdateBtn.disabled = false
          newCancelBtn.disabled = false
          newUpdateBtn.classList.remove("executing")
          newUpdateBtn.innerHTML = `
            <span class="material-icons">refresh</span>
            Try Again
          `
          resolve(false)
        }
      }

      const handleCancel = () => {
        console.log("Spicetify update cancelled by user")
        this.closeSpicetifyUpdateModal()
        resolve(false)
      }

      newUpdateBtn.addEventListener("click", handleUpdate)
      newCancelBtn.addEventListener("click", handleCancel)

      document.body.classList.add("modal-open")
      modal.classList.remove("hidden")

      requestAnimationFrame(() => {
        modal.classList.add("visible")
        console.log("Spicetify modal should now be visible")
      })
    })
  }

  private async setupSpicetifyProgressListener(): Promise<void> {
    if (!this.isTauriAvailable) {
      console.warn("[UpdateManager] Cannot setup progress listener - Tauri not available")
      return
    }

    try {
      this.spicetifyProgressListener = await listen("progress_update", (event: any) => {
        const progress = event.payload as number
        this.updateSpicetifyProgressBar(progress)
      })
      console.log("[UpdateManager] Spicetify progress listener setup complete")
    } catch (error) {
      console.warn("[UpdateManager] Failed to setup Spicetify progress listener:", error)
    }
  }

  private removeSpicetifyProgressListener(): void {
    if (this.spicetifyProgressListener) {
      this.spicetifyProgressListener()
      this.spicetifyProgressListener = null
      console.log("[UpdateManager] Spicetify progress listener removed")
    }
  }

  private updateSpicetifyProgressBar(percentage: number): void {
    const progressBar = document.getElementById("spicetify-progress-bar")
    const progressPercentage = document.getElementById("spicetify-progress-percentage")

    if (progressBar) {
      progressBar.style.width = `${percentage}%`
    }
    if (progressPercentage) {
      progressPercentage.textContent = `${Math.round(percentage)}%`
    }

    console.log(`[UpdateManager] Spicetify progress: ${percentage}%`)
  }

  private async installSpicetifyUpdate(): Promise<void> {
    if (!this.isTauriAvailable) {
      throw new Error("Tauri runtime not available")
    }

    try {
      console.log("Starting Spicetify update installation...")
      const result = await invoke("install_spicetify_direct")
      console.log("Spicetify update command completed:", result)

      this.updateSpicetifyProgressBar(100)
    } catch (error) {
      console.error("Spicetify update command failed:", error)
      throw new Error(`Spicetify update failed: ${error}`)
    }
  }

  private showSpicetifyUpdateError(error: string): void {
    const modal = this.spicetifyUpdateModal!
    const message = modal.querySelector("#spicetify-update-modal-message") as HTMLElement
    const updateBtn = modal.querySelector("#spicetify-update-download-btn") as HTMLButtonElement
    const cancelBtn = modal.querySelector("#spicetify-update-cancel-btn") as HTMLButtonElement

    message.innerHTML = `
      <div class="update-info-container">
        <div class="update-icon warning-icon">
          <span class="material-icons">error</span>
        </div>
        <div class="update-details">
          <p class="update-intro error-text">Spicetify Update Failed</p>
          <p class="update-benefits">
            ${error}
          </p>
          <p class="update-benefits">
            You can try again later or install manually using the INSTALL command.
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

  private closeSpicetifyUpdateModal(): void {
    if (this.spicetifyUpdateModal) {
      document.body.classList.remove("modal-open")
      this.spicetifyUpdateModal.classList.remove("visible")
      setTimeout(() => {
        this.spicetifyUpdateModal!.classList.add("hidden")
      }, 300)
    }
  }

  private createSpicetifyUpdateModal(): void {
    console.log("createSpicetifyUpdateModal called")

    const existingModal = document.getElementById("spicetify-update-modal")
    if (existingModal) {
      console.log("Removing existing Spicetify modal")
      existingModal.remove()
    }

    const modal = document.createElement("div")
    modal.id = "spicetify-update-modal"
    modal.className = "modal hidden"

    modal.innerHTML = `
      <div class="modal-content update-modal-content">
        <div class="modal-header">
          <h2 id="spicetify-update-modal-title">Spicetify Update Available</h2>
          <button id="close-spicetify-update-modal" class="close-button">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div id="spicetify-update-modal-message">A Spicetify update is available.</div>
          <div class="update-actions">
            <button id="spicetify-update-download-btn" class="update-btn">
              <span class="material-icons">download</span>
              Install Update
            </button>
            <button id="spicetify-update-cancel-btn" class="cancel-btn">
              <span class="material-icons">close</span>
              Cancel
            </button>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(modal)
    console.log("Spicetify modal appended to body")

    const closeBtn = modal.querySelector("#close-spicetify-update-modal")
    closeBtn?.addEventListener("click", () => {
      console.log("Spicetify close button clicked")
      this.closeSpicetifyUpdateModal()
    })

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        console.log("Spicetify modal backdrop clicked")
        this.closeSpicetifyUpdateModal()
      }
    })

    this.spicetifyUpdateModal = modal
    console.log("Spicetify update modal created and stored")
  }

  // ... existing code for other methods ...

  async showUpdateDialog(updateInfo: UpdateInfo): Promise<boolean> {
    // ... existing implementation ...
    return false
  }

  private async downloadAndInstallUpdate(downloadUrl: string): Promise<void> {
    // ... existing implementation ...
  }

  private showUpdateError(error: string): void {
    // ... existing implementation ...
  }

  private closeUpdateModal(): void {
    // ... existing implementation ...
  }

  private createUpdateModal(): void {
    // ... existing implementation ...
  }

  private async setupEventListeners(): Promise<void> {
    if (!this.isTauriAvailable) {
      console.warn("[UpdateManager] Skipping event listener setup - Tauri not available")
      return
    }

    try {
      await listen("update_progress", (event) => {
        const progress = event.payload as UpdateProgress
        if (this.progressCallback) {
          this.progressCallback(progress)
        }
        console.log(`Update progress: ${progress.stage} - ${progress.progress}% - ${progress.message}`)
      })
    } catch (error) {
      console.warn("[UpdateManager] Failed to setup event listeners:", error)
    }
  }

  setProgressCallback(callback: (progress: UpdateProgress) => void): void {
    this.progressCallback = callback
  }
}
