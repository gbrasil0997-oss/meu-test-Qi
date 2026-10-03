const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Servir ficheiros estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Configurações do Asaas
const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://www.asaas.com/api/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

// Armazenamento temporário do estado dos pagamentos
const cobrancasStatus = {};

// 1. ENDPOINT: Criar cobrança PIX no Asaas (R$ 2,00)
app.post('/api/criar-pix', async (req, res) => {
  try {
    if (!ASAAS_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'Chave de API do Asaas não configurada no servidor.' 
      });
    }

    // Criar pagamento no Asaas
    const cobrancaResponse = await axios.post(
      `${ASAAS_API_URL}/payments`,
      {
        customer: process.env.ASAAS_CUSTOMER_ID || 'cus_000006028080',
        billingType: 'PIX',
        value: 2.00,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        description: 'Desbloqueio do Relatório de QI + Certificado CogniMatrix',
      },
      {
        headers: { access_token: ASAAS_API_KEY }
      }
    );

    const paymentId = cobrancaResponse.data.id;

    // Buscar o QR Code e Payload Copia e Cola
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
    console.error('Erro Asaas:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao gerar PIX no Asaas.',
      details: error.response?.data?.errors?.[0]?.description || error.message
    });
  }
});

// 2. WEBHOOK: Recebe a notificação de pagamento confirmado direto do Asaas
app.post('/api/webhook-asaas', (req, res) => {
  const { event, payment } = req.body;

  if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    if (payment && payment.id) {
      cobrancasStatus[payment.id] = 'RECEIVED';
      console.log(`✅ Pagamento ${payment.id} confirmado com sucesso!`);
    }
  }

  res.status(200).send('OK');
});

// 3. ENDPOINT: O site consulta se a cobrança já foi paga
app.get('/api/checar-status/:paymentId', (req, res) => {
  const paymentId = req.params.paymentId;
  const status = cobrancasStatus[paymentId] || 'PENDING';

  res.json({
    paymentId: paymentId,
    pago: status === 'RECEIVED'
  });
});

// Entregar a página inicial index.html para qualquer outra rota
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a rodar na porta ${PORT}`);
});
