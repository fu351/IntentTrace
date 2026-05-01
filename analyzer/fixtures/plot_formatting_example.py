import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("weather.csv")
summary = df.groupby("state")["temperature"].mean().reset_index()
plt.bar(summary["state"], summary["temperature"])
plt.xlabel("Region")
plt.ylabel("Count")
plt.title("Humidity by state")
plt.show()
