# WindBorne Live Tracker

This repository hosts an interactive web application that displays the global positions of WindBorne balloons over the past 24 hours in real time. It provides detailed analytics and visualizations for each balloon, including altitude, speed, direction, and local wind conditions, offering insights into how wind affects their trajectories. Additionally, the visualizations allow for assessment of telematics data consistency and reliability, making it a valuable tool for refining and improving the data pipeline. Finally, it uses a ML model trained on historical path and wind data to predict the position in the next hour for each balloon, however, there is still a lot that can be improved.

Live interactive demo: [https://windborneproject.vercel.app/](https://windborneproject.vercel.app/)

---

## Features 🚀

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

- **ML based Future Hour Position Prediction Proof of Concept**
  - Uses a linear regression model trained on 100 24h balloon trajectories.
  - Features: Deltas between consecutive points and wind conditions computed over the last 21 hours.
  - Predicts the next position (latitude, longitude, altitude) for the selected balloon.
  - Visualized as a dashed purple line extending from the current balloon location.
 
  <img width="330" height="344" alt="image" margin-top="20" src="https://github.com/user-attachments/assets/1accd03f-1bba-4c89-b565-ea45fa5f2276" />

---

## Future Work
  - Add more features to train the model besides location and wind.  
  - Use a better architecture instead of a basic regression that captures time series data, such as RNN.
---

## Tech Stack 🛠️

- **Frontend**: React + Vite  
- **Map Rendering**: MapLibre GL JS  
- **Charts**: Plotly.js  
- **Data Sources**:  
  - Balloon positions fetched hourly [Sample](https://a.windbornesystems.com/treasure/00.json) 
  - Local wind data from [Open-Meteo](https://open-meteo.com/)  
- **Hosting**: Vercel

---

## ⚙️ Local Development

```bash
git clone https://github.com/benatfroemming/WindBorne.git
cd WindBorne
npm install
npm run dev
