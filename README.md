# WindBorne Live Tracker

This repository is an interactive web application that visualizes the live global positions of WindBorne balloons over the past 24 hours. It also shows key analytics and plots of each balloon’s altitude, speed, direction, and local wind conditions.  

Deployed on GitHub Pages: [https://benatfroemming.github.io/WindBorne](https://benatfroemming.github.io/WindBorne)

---

## 🚀 Features

- **Hourly Animation & Time Slider**
  - Displays all active weather balloons as colored circles on a MapLibre GL map.  
  - Scroll through the past 24 hours to see how balloons move.  
  - Selected balloon is highlighted in blue for easy tracking.  

- **Balloon Statistics Panel**  
  - Displays live data for the selected balloon:
    - Latitude & Longitude  
    - Altitude (km)  
    - Speed (km/h)  
    - Direction (°)  
    - Wind speed & direction (m/s and °)  

- **Interactive Plots with Plotly**  
  - Altitude, speed, direction, wind speed, and wind direction charts update dynamically.  

---

## 🛠️ Tech Stack

- **Frontend**: React + Vite  
- **Map Rendering**: MapLibre GL JS  
- **Charts**: Plotly.js  
- **Data Sources**:  
  - Balloon positions fetched hourly (JSON)  
  - Local wind data from [Open-Meteo](https://open-meteo.com/)  
- **Hosting**: GitHub Pages  

---

## ⚙️ Local Development

1. **Clone the repo**

```bash
git clone https://github.com/benatfroemming/WindBorne.git
cd WindBorne
npm install
npm run dev
