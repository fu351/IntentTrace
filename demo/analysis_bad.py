import pandas as pd
import matplotlib.pyplot as plt


df = pd.read_csv("weather.csv")
backup = df.copy()
print(df.head())
df = df.dropna(subset=["state", "temperature"])
summary = df.groupby("state")["temperature"].count().reset_index()
humidity = df.groupby("state")["humidity"].mean().reset_index()
plt.plot(summary["state"], summary["temperature"])
plt.show()
