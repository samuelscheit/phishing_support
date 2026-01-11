docker build -f Dockerfile.utils-test -t test --platform=linux/amd64 .
docker run --rm --platform=linux/amd64 --mount type=bind,src=/root/phishing_support/test,dst=/data/ test