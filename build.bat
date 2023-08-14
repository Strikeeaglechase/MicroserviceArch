@echo off
cd core
start cmd /k "npx tsc -w"

cd ../transformer
start cmd /k "npx tsc -w"

cd ../service
start cmd /k "npx tsc -w"

cd ../serviceLib
start cmd /k "npx tsc -w"

cd ../consumer
start cmd /k "npx tsc -w"

cd ..