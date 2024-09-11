#!/bin/bash

while true
do
node deploy-commands.js | ts '[%Y-%m-%d %H:%M:%S]'
nodemon --exitcrash ./index.js | ts '[%Y-%m-%d %H:%M:%S]'
echo "Stopped... Press CTRL+C again to exit."
sleep 5
done

