export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // 上游 DNS：使用 Cloudflare 官方 DoH IP，速度最快且稳定
    const upstream = 'https://1.1.1.1/dns-query';

    // 1. 处理 Chrome 的 POST 请求 (这是 Chrome 验证的主要方式)
    if (request.method === 'POST') {
      return await forwardRequest(request, upstream);
    }

    // 2. 处理 GET 请求 (带 ?dns= 参数的标准 DoH)
    if (request.method === 'GET' && url.searchParams.has('dns')) {
      return await forwardRequest(request, upstream + url.search);
    }

    // 3. 浏览器直接访问 (无参数)，返回简单文字，证明服务在线
    // 这一步虽然返回 text/plain，但只给人看，不给 Chrome 的 DNS 引擎看
    return new Response('DoH Service is Running.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};

async function forwardRequest(request, upstreamUrl) {
  // 构建转发给 1.1.1.1 的请求
  const newHeaders = new Headers(request.headers);
  // 强制接收二进制 DNS 消息
  newHeaders.set('Accept', 'application/dns-message');
  
  // 删除可能导致 Cloudflare 拒绝的头
  newHeaders.delete('Host');

  const fetchOptions = {
    method: request.method,
    headers: newHeaders,
    redirect: 'follow'
  };

  // 如果是 POST，需要转发 Body
  if (request.method === 'POST') {
    fetchOptions.body = await request.arrayBuffer();
    newHeaders.set('Content-Type', 'application/dns-message');
  }

  try {
    const response = await fetch(upstreamUrl, fetchOptions);

    // === 关键修复点 ===
    // 重建响应头，骗过 Chrome 的严格检查
    const responseHeaders = new Headers(response.headers);
    
    // 强制设置为标准的 DoH 类型 (Chrome 只要看到这个就高兴)
    responseHeaders.set('Content-Type', 'application/dns-message');
    
    // 删除 Content-Length，防止传输过程中长度计算不一致导致截断
    responseHeaders.delete('Content-Length');
    
    // 允许跨域 (CORS)，方便此时测试
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response('Proxy Error', { status: 502 });
  }
}
