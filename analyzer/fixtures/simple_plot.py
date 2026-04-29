import pandas as pd
import matplotlib.pyplot as plt


df = pd.read_csv("sales.csv")
summary = df.groupby("state")["temperature"].mean().reset_index()
plt.plot(summary["state"], summary["temperature"])
plt.show()
