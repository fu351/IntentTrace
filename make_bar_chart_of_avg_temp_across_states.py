import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("demo\\weather.csv")

agg_df = df.groupby("state")["humidity"].mean().reset_index()
plt.bar(agg_df["state"], agg_df["humidity"])
plt.title("Average Humidity by State")
plt.xlabel("State")
plt.ylabel("Average Humidity")
plt.show()
