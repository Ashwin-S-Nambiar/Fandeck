const inputColor = document.getElementById("input-color")
const colorBtn = document.getElementById("color-btn")
const colorSelect = document.getElementById("color-select")
const colors = document.querySelector(".colors")
const copyToast = document.getElementById("copyToast")

let colorsArr = []

colorBtn.addEventListener("click", () => {
  const color = inputColor.value.slice(1, 7)
  const option = colorSelect.value
  fetch(`https://www.thecolorapi.com/scheme?hex=${color}&mode=${option}&count=5`)
    .then((res) => res.json())
    .then((data) => {
      const dataColors = data.colors.map((color) => ({
        hex: color.hex.value,
        name: color.name.value,
      }))
      colorsArr = dataColors
      renderData(colorsArr)
    })
    .catch((error) => {
      console.error("Error fetching color scheme:", error)
      showToast("Failed to fetch color scheme. Please try again.")
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

// Initialize with random colors
colorBtn.click()