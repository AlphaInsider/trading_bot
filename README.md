# !! UNDER ACTIVE DEVELOPEMENT, NOT READY FOR USE!!

# trading_bot
Trading bot that follows AlphaInsider strategies

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/AlphaInsider/trading_bot/tree/master)

[![Deploy to DigitalOcean](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/AlphaInsider/trading_bot/tree/master)

## Run
`$ docker compose up`

## Test
`$ docker compose run trading_bot bash`  
`$ node test.js`

# Build Production Services
$ docker-compose -f docker-compose-prod.yml build --no-cache
# Publish image to dockerhub (tag optional)
$ docker push alphainsider/<service>:<tag?>
