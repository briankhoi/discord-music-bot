:1
    node deploy-commands.js
    nodemon --exitcrash ./index.js
    echo "Stopped... Press CTRL+C again to exit."
    timeout /t 5
goto 1

