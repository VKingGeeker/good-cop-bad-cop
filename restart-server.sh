#!/bin/bash
cp /tmp/main.js /home/ubuntu/good-cop-bad-cop/server/dist/main.js
pkill -9 -f "main.js"
sleep 3
cd /home/ubuntu/good-cop-bad-cop/server/dist
nohup node ./main.js > /tmp/server.log 2>&1 &
