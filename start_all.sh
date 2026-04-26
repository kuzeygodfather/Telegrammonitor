#!/bin/bash
# Kill stale processes
pkill -9 -f "multi_backend.py" 2>/dev/null
pkill -9 -f "multi_setup.py" 2>/dev/null
sleep 2

# Clean session locks
rm -f /opt/telegram-monitor/session.session-journal
rm -f /opt/telegram-monitor/sessions/*.session-journal

# Start multi_setup (API for registration)
cd /opt/telegram-monitor/backend
/opt/telegram-monitor/venv/bin/python3 multi_setup.py > /tmp/multi_setup.log 2>&1 &
echo "multi_setup started: $!"
sleep 2

# Start multi_backend (Telegram listener)
/opt/telegram-monitor/venv/bin/python3 multi_backend.py > /tmp/multi_backend.log 2>&1 &
echo "multi_backend started: $!"
