const inputColor = document.getElementById("input-color")
const colorBtn = document.getElementById("color-btn")
const colorSelect = document.getElementById("color-select")
const colors = document.querySelector(".colors")
const copyToast = document.getElementById("copyToast")
const statusIndicator = document.getElementById("status-indicator")
const statusText = document.getElementById("status-text")
const apiStatusContainer = document.getElementById("api-status")

let colorsArr = []
let apiStatus = 'checking' // 'online', 'offline', 'checking'

// Check API status on page load
checkApiStatus()

// Check API status every 5 minutes
setInterval(checkApiStatus, 5 * 60 * 1000)

async function checkApiStatus() {
    try {
        updateStatusDisplay('checking', 'Checking API...')
        
        // Test API connectivity
        const response = await fetch('https://www.thecolorapi.com/scheme?hex=000000&mode=monochrome&count=1', {
            method: 'GET',
            timeout: 10000
        })
        
        if (response.ok) {
            apiStatus = 'online'
            updateStatusDisplay('online', 'Color API is Up')
        } else {
            apiStatus = 'offline'
            updateStatusDisplay('offline', 'Color API is Down')
        }
    } catch (error) {
        apiStatus = 'offline'
        updateStatusDisplay('offline', 'Color API is Down')
        console.error('API status check failed:', error)
    }
}

function updateStatusDisplay(status, text) {
    statusIndicator.className = `status-indicator ${status}`
    statusText.textContent = text
    
    // Update the API status container class for styling
    apiStatusContainer.className = `api-status ${status}`
    
    // Update button state based on API status
    if (status === 'offline') {
        colorBtn.disabled = true
        colorBtn.style.opacity = '0.5'
        colorBtn.style.cursor = 'not-allowed'
    } else if (status === 'online') {
        colorBtn.disabled = false
        colorBtn.style.opacity = ''
        colorBtn.style.cursor = 'pointer'
    }
}

colorBtn.addEventListener("click", () => {
  if (apiStatus === 'offline') {
    showToast("Color API is currently unavailable. Please try again later.")
    return
  }
  
  const color = inputColor.value.slice(1, 7)
  const option = colorSelect.value
  fetch(`https://www.thecolorapi.com/scheme?hex=${color}&mode=${option}&count=5`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      return res.json()
    })
    .then((data) => {
      const dataColors = data.colors.map((color) => ({
        hex: color.hex.value,
        name: color.name.value,
      }))
      colorsArr = dataColors
      renderData(colorsArr)
      
      // Update API status to online if request was successful
      if (apiStatus !== 'online') {
        apiStatus = 'online'
        updateStatusDisplay('online', 'Color API is Up')
      }
    })
    .catch((error) => {
      console.error("Error fetching color scheme:", error)
      apiStatus = 'offline'
      updateStatusDisplay('offline', 'Color API is Down')
      showToast("Failed to fetch color scheme. API may be down.")
    })
})

const renderData = (data) => {
  const html = data
    .map(
      (color) => `
        <div class="color-block" 
             style="background-color: ${color.hex}"
             data-color="${color.hex}">
            <div class="color-info">
                <div class="color-hex">${color.hex}</div>
                <div class="color-name">${color.name}</div>
            </div>
        </div>`,
    )
    .join("")

  colors.innerHTML = html

  document.querySelectorAll(".color-block").forEach((colorElement) => {
    colorElement.addEventListener("click", () => copyColor(colorElement))
    setTextColor(colorElement)
  })
}

function copyColor(colorElement) {
  const colorValue = colorElement.dataset.color

  navigator.clipboard
    .writeText(colorValue)
    .then(() => {
      showToast(`${colorValue} copied to clipboard`)
      animateColorClick(colorElement)
    })
    .catch((err) => {
      console.error("Failed to copy color:", err)
      showToast("Failed to copy color")
    })
}

function showToast(message) {
  copyToast.textContent = message
  copyToast.classList.add("active")

  setTimeout(() => {
    copyToast.classList.remove("active")
  }, 2000)
}

function animateColorClick(element) {
  element.style.transform = "scale(0.95)"
  setTimeout(() => {
    element.style.transform = "scale(1)"
  }, 100)
}

function setTextColor(element) {
  const backgroundColor = element.style.backgroundColor
  const rgb = backgroundColor.match(/\d+/g)
  const brightness = Math.round(
    (Number.parseInt(rgb[0]) * 299 + Number.parseInt(rgb[1]) * 587 + Number.parseInt(rgb[2]) * 114) / 1000,
  )
  const textColor = brightness > 125 ? "black" : "white"
  element.querySelector(".color-info").style.color = textColor
  element.querySelector(".color-info").style.textShadow = textColor === "white" ? "0 1px 3px rgba(0,0,0,0.3)" : "none"
}

const shareBtn = document.getElementById("share-btn");

shareBtn.addEventListener("click", () => {
    if (colorsArr.length === 0) {
        showToast("Generate a palette first!");
        return;
    }

    const hexValues = colorsArr.map(color => color.hex.replace("#", "")).join("-");
    const shareURL = `${window.location.origin}${window.location.pathname}?palette=${hexValues}`;

    navigator.clipboard.writeText(shareURL)
        .then(() => showToast("Palette link copied!"))
        .catch(() => showToast("Failed to copy link"));
});

// Read palette from URL and display it
const urlParams = new URLSearchParams(window.location.search);
const paletteParam = urlParams.get("palette");

if (paletteParam) {
    const hexColors = paletteParam.split("-").map(hex => `#${hex}`);
    colorsArr = hexColors.map(hex => ({ hex, name: "" }));
    renderData(colorsArr);
} else {
    // Initialize with random colors only if no shared palette exists
    colorBtn.click();
}