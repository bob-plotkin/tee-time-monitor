# Tee Time Monitor - Simple Version

A simplified Chrome extension for monitoring golf tee time availability at Westchester County golf courses, with optional auto-booking.

## Features

✅ **Simple & Clean Interface** - Easy-to-use control panel  
✅ **Full Date Selection** - Choose any month and day  
✅ **Course Selection** - Monitor specific courses or all at once  
✅ **Time Range Alerts** - Get notified when times appear in your desired window  
✅ **Visual & Audio Alerts** - Desktop notifications and optional sound alerts  
✅ **Auto-Refresh** - Automatically checks for new times at your specified interval  
✅ **Optional Auto-Booking** - Can automatically attempt to book the first 2 available times (disabled by default)  

## Installation

1. Download all files from this folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the folder containing these files
6. The extension icon (golf ball) will appear in your toolbar

## How to Use

1. **Navigate to the Golf Site**
   - Go to: https://westchestercountyph.ezlinksgolf.com
   - The monitor panel will automatically appear in the top-right corner

2. **Configure Your Settings**
   - **Date**: Select the month, day, and year you want to play
   - **Time Range**: Set your preferred tee time window (e.g., 9:00 AM to 11:00 AM)
   - **Courses**: Click "Select All" or choose specific courses to monitor
   - **Refresh Rate**: Set how often to check (default: 30 seconds)
   - **Auto-Booking**: Enable if you want automatic booking attempts (disabled by default)

3. **Start Monitoring**
   - Click "Start Monitoring" to begin auto-refresh
   - Or click "Check Now" for a one-time check
   - The extension will:
     - Set your selected date
     - Filter by your selected courses
     - Check for times in your range
     - Alert you when times are found

4. **When Times Are Found**
   - Desktop notification appears
   - Sound plays (if enabled)
   - Found times show in the status area
   - Auto-refresh stops automatically

## Key Differences from Original

This simplified version:
- ✅ Optional auto-booking (can be toggled on/off)
- ✅ Uses proven simple selectors from working version
- ✅ No complex authentication handling
- ✅ No session preservation needed
- ✅ Clean monitoring and alerting
- ✅ More reliable and maintainable
- ✅ Full date and course selection
- ✅ Clean, modern UI

## Tips

- **Test Mode**: Use "Check Now" to test without auto-refresh
- **Course Selection**: Uncheck Hudson Hills if you don't want it
- **Sound Control**: Toggle sound alerts on/off as needed
- **Minimize**: Click "_" to minimize the panel, click "Show Monitor" to restore

## Troubleshooting

**Panel doesn't appear?**
- Make sure you're on the correct website
- Refresh the page
- Check that the extension is enabled in Chrome

**No notifications?**
- Allow notifications for Chrome in your system settings
- Make sure the site has notification permissions

**Times not found?**
- Verify your date is correct
- Check that times exist in your selected range
- Ensure courses are properly selected

## Files Included

- `manifest.json` - Extension configuration
- `content.js` - Main monitoring logic
- `styles.css` - UI styling
- `background.js` - Notification handler
- `popup.html/js` - Extension popup
- `icon.png` - Extension icon

## Privacy

This extension:
- Only runs on the golf booking website
- Stores settings locally in your browser
- Does not collect or transmit any data
- Does not require any login or authentication

## Support

This is a simplified version designed for reliability and ease of use. If you need auto-booking features, you may need to use the more complex original version, but be prepared to handle authentication issues manually.
