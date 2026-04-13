from PIL import Image, ImageDraw

# Create a new image with transparent background
size = 128
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Draw a golf ball (white circle with dimples)
center = size // 2
radius = 50

# Outer circle (golf ball)
draw.ellipse([center-radius, center-radius, center+radius, center+radius], 
             fill=(255, 255, 255, 255), outline=(200, 200, 200, 255), width=2)

# Draw dimples pattern
dimple_positions = [
    (-20, -20), (0, -25), (20, -20),
    (-25, 0), (25, 0),
    (-20, 20), (0, 25), (20, 20),
    (-10, -10), (10, -10),
    (-10, 10), (10, 10)
]

for dx, dy in dimple_positions:
    x, y = center + dx, center + dy
    draw.ellipse([x-3, y-3, x+3, y+3], fill=(230, 230, 230, 255))

# Add a flag/pin
flag_x = center + 30
flag_y = center - 40
# Flag pole
draw.line([(flag_x, flag_y), (flag_x, center)], fill=(139, 69, 19, 255), width=2)
# Flag
draw.polygon([(flag_x, flag_y), (flag_x + 15, flag_y + 5), (flag_x, flag_y + 10)], 
             fill=(255, 0, 0, 255))

# Save the image
img.save('/mnt/user-data/outputs/tee-time-monitor-simple/icon.png', 'PNG')
print("Icon created successfully!")
