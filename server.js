const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());

// Servir ficheiros estáticos da pasta public
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

// Configurações do Asaas
const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://www.asaas.com/api/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

// Armazenamento em memória do status dos pagamentos
const cobrancasStatus = {};

// 1. ENDPOINT: Criar cobrança PIX no Asaas
app.post('/api/criar-pix', async (req, res) => {
  try {
    if (!ASAAS_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'Chave de API do Asaas não configurada no Render.' 
      });
    }

    // Gerar um sufixo aleatório para criar um cliente único com CPF válido
    const randomId = Math.floor(1000 + Math.random() * 9000);
    
    // Tenta criar um novo cliente com CPF matematicamente válido
    let customerId;
    try {
      const customerResponse = await axios.post(
        `${ASAAS_API_URL}/customers`,
        {
          name: `Cliente Intelectus QI ${randomId}`,
          email: `cliente${randomId}@intelectusqi.com`,
          cpfCnpj: '21528701026' // CPF Válido
        },
        {
          headers: { access_token: ASAAS_API_KEY }
        }
      );
      customerId = customerResponse.data.id;
    } catch (custErr) {
      // Caso haja restrição, procura um cliente já existente na conta
      const searchResponse = await axios.get(`${ASAAS_API_URL}/customers?limit=1`, {
        headers: { access_token: ASAAS_API_KEY }
      });
      if (searchResponse.data.data && searchResponse.data.data.length > 0) {
        customerId = searchResponse.data.data[0].id;
      } else {
        throw custErr;
      }
    }

    // 2. Criar a cobrança PIX
    const cobrancaResponse = await axios.post(
      `${ASAAS_API_URL}/payments`,
      {
        customer: customerId,
        billingType: 'PIX',
        value: 2.00,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        description: 'Desbloqueio do Relatório de QI + Certificado CogniMatrix'
      },
      {
        headers: { access_token: ASAAS_API_KEY }
      }
    );

    const paymentId = cobrancaResponse.data.id;

    // 3. Obter QR Code e Payload Copia e Cola
    const qrCodeResponse = await axios.get(
      `${ASAAS_API_URL}/payments/${paymentId}/pixQrCode`,
      {
        headers: { access_token: ASAAS_API_KEY }
      }
    );

    cobrancasStatus[paymentId] = 'PENDING';

    res.json({
      success: true,
      paymentId: paymentId,
      encodedImage: qrCodeResponse.data.encodedImage,
      payload: qrCodeResponse.data.payload,
      expirationDate: qrCodeResponse.data.expirationDate
    });

  } catch (error) {
    const errorDetails = error.response?.data?.errors?.[0]?.description || error.response?.data || error.message;
    console.error('Erro Asaas detalhado:', errorDetails);

    res.status(500).json({ 
      success: false, 
      message: `Erro ao gerar PIX: ${typeof errorDetails === 'object' ? JSON.stringify(errorDetails) : errorDetails}` 
    });
  }
});

// 2. WEBHOOK: Confirmar pagamento
app.post('/api/webhook-asaas', (req, res) => {
  const { event, payment } = req.body;
  if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    if (payment && payment.id) {
      cobrancasStatus[payment.id] = 'RECEIVED';
    }
  }
  res.status(200).send('OK');
});

// 3. ENDPOINT: Checar status
app.get('/api/checar-status/:paymentId', (req, res) => {
  const paymentId = req.params.paymentId;
  const status = cobrancasStatus[paymentId] || 'PENDING';
  res.json({ paymentId, pago: status === 'RECEIVED' });
});

// 4. ROTA PRINCIPAL: Entrega o index.html
app.get('*', (req, res) => {
  const indexPath = path.resolve(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Ficheiro index.html não foi encontrado na pasta public.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor a rodar na porta ${PORT}`));
