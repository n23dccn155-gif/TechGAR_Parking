import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches

with open('frontend/graph.json', 'r') as f:
    graph = json.load(f)

nodes = graph['nodes']
edges = graph['edges']
spots = graph['spots']

fig, ax = plt.subplots(figsize=(12, 12))

# Plot spots as rectangles (Regions Of Interest - ROI)
for spot in spots:
    # coordinates in SVG are from top-left, so we can draw a rectangle
    # since we will invert the y-axis, the rectangle drawing should work normally.
    rect = patches.Rectangle(
        (spot['x'], spot['y']), 
        spot['width'], spot['height'], 
        linewidth=1, 
        edgecolor='gray', 
        facecolor='lightgray', 
        alpha=0.5
    )
    ax.add_patch(rect)
    ax.text(
        spot['x'] + spot['width']/2, 
        spot['y'] + spot['height']/2, 
        spot['id'], 
        color='black', 
        ha='center', 
        va='center', 
        fontsize=8
    )

# Plot edges
for edge in edges:
    from_node = next((n for n in nodes if n['id'] == edge['from']), None)
    to_node = next((n for n in nodes if n['id'] == edge['to']), None)
    if from_node and to_node:
        color = 'blue' if edge['direction'] == 'two-way' else 'red'
        ax.plot([from_node['x'], to_node['x']], [from_node['y'], to_node['y']], color=color, linewidth=2, alpha=0.6)

# Plot nodes
for node in nodes:
    color = 'black'
    size = 20
    if node['kind'] == 'entrance' or node['kind'] == 'exit':
        color = 'green'
        size = 100
    elif node['kind'] == 'spot-entry':
        color = 'orange'
        size = 40
    
    ax.scatter(node['x'], node['y'], c=color, s=size, zorder=5)

ax.invert_yaxis()
ax.set_title('Lane Graph & Spot ROIs (Blue: Two-way, Red: One-way)')
ax.set_aspect('equal')
plt.savefig('lane_graph_with_spots.png', dpi=150, bbox_inches='tight')
