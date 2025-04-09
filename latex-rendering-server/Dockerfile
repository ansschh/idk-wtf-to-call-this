FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install prerequisites for Node.js
RUN apt-get update && apt-get install -y curl gnupg software-properties-common

# Install Node.js 18 LTS from official NodeSource repo
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Install other required packages
RUN apt-get update && apt-get install -y \
    texlive-full \
    ghostscript \
    imagemagick \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Fix ImageMagick PDF policy to allow PDF processing
RUN sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml

# Set up working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy server code and other files
COPY server.js ./ 
COPY public ./public

# Create temp directory
RUN mkdir -p temp

# Expose the port
EXPOSE 3001

# Start the Node.js server
CMD ["node", "server.js"]