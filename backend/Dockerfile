FROM node:18

# Sistemde Python yüklü değilse yüklüyoruz
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

COPY package*.json ./
RUN npm install

# Python scriptleri için gerekli pip package'ları yükle
COPY requirements.txt ./
RUN pip3 install --break-system-packages -r requirements.txt
COPY . .

EXPOSE 5137
CMD ["npm", "start"]