import pandas as pd
import matplotlib.pyplot as plt


df = pd.read_csv("weather.csv")
df = df.dropna(subset=["state", "temperature"])
mean_summary = df.groupby("state")["temperature"].mean().reset_index()
count_summary = df.groupby("state")["temperature"].count().reset_index()
agg_summary = df.groupby("state").agg({"temperature": "mean"}).reset_index()
plt.plot(count_summary["state"], count_summary["temperature"])
plt.show()
