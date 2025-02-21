/*
 * Copyright (c) 2010, 2025 BSI Business Systems Integration AG
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */
package org.eclipse.scout.rt.shared.servicetunnel.http;

import static org.junit.Assert.*;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

import jakarta.ws.rs.core.Response.Status;

import org.eclipse.scout.rt.platform.BEANS;
import org.eclipse.scout.rt.platform.serialization.SerializationUtility;
import org.eclipse.scout.rt.rest.jersey.TestJerseyMockConnector;
import org.eclipse.scout.rt.rest.jersey.TestingRestClientConfigFactory;
import org.eclipse.scout.rt.shared.SharedConfigProperties.ServiceTunnelTargetUrlProperty;
import org.eclipse.scout.rt.shared.servicetunnel.BinaryServiceTunnelContentHandler;
import org.eclipse.scout.rt.shared.servicetunnel.ServiceTunnelRequest;
import org.eclipse.scout.rt.shared.servicetunnel.ServiceTunnelResponse;
import org.eclipse.scout.rt.testing.platform.mock.BeanMock;
import org.eclipse.scout.rt.testing.platform.runner.PlatformTestRunner;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;

import com.google.api.client.testing.http.MockLowLevelHttpResponse;

/**
 * Tests for {@link HttpServiceTunnel}
 */
@RunWith(PlatformTestRunner.class)
public class HttpServiceTunnelTest {

  @BeanMock
  private ServiceTunnelTargetUrlProperty mockUrl;

  @BeforeClass
  public static void beforeClass() {
    BEANS.get(TestingRestClientConfigFactory.class).setConnectorProvider((client, runtimeConfig) -> BEANS.get(TestJerseyMockConnector.class));
  }

  @AfterClass
  public static void afterClass() {
    BEANS.get(TestingRestClientConfigFactory.class).resetConnectorProvider();
  }

  @Test
  public void testTunnel() throws IOException {
    when(mockUrl.getValue()).thenReturn("http://localhost");
    MockLowLevelHttpResponse expectedResponse = new MockLowLevelHttpResponse().setContent(serialize(new ServiceTunnelResponse("testData")));
    HttpServiceTunnel tunnel = createHttpServiceTunnel(expectedResponse);
    tunnel.setContentHandler(getTestContentHandler());

    ServiceTunnelRequest request = new ServiceTunnelRequest("IPingService", "ping", null, null);
    ServiceTunnelResponse response = tunnel.tunnel(request);
    assertNotNull(response);
    assertEquals("testData", response.getData());
  }

  @Test
  public void testTunnelException() throws IOException {
    when(mockUrl.getValue()).thenReturn("http://localhost");
    MockLowLevelHttpResponse expectedResponse = new MockLowLevelHttpResponse().setStatusCode(401).setContent(InputStream.nullInputStream());
    HttpServiceTunnel tunnel = createHttpServiceTunnel(expectedResponse);
    tunnel.setContentHandler(getTestContentHandler());

    ServiceTunnelRequest request = new ServiceTunnelRequest("IPingService", "ping", null, null);
    ServiceTunnelResponse response = tunnel.tunnel(request);
    assertNotNull(response);
    assertTrue(response.getException() instanceof HttpServiceTunnelException);
    assertEquals(401, ((HttpServiceTunnelException) response.getException()).getHttpStatus());
  }

  protected HttpServiceTunnel createHttpServiceTunnel(final MockLowLevelHttpResponse expectedResponse) throws IOException {
    TestJerseyMockConnector testJerseyMockConnector = BEANS.get(TestJerseyMockConnector.class);
    testJerseyMockConnector.setNextResponseStatus(Status.fromStatusCode(expectedResponse.getStatusCode()));
    testJerseyMockConnector.setNextResponseEntityStream(expectedResponse.getContent());
    return new HttpServiceTunnel();
  }

  /**
   * {@link HttpServiceTunnel} should be inactive, if no url is defined.
   */
  @Test
  public void testNullUrlConfig() {
    HttpServiceTunnel tunnel = new HttpServiceTunnel();
    assertFalse(tunnel.isActive());
  }

  /**
   * {@link HttpServiceTunnel} should be inactive, if no url is defined.
   */
  @Test
  public void testEmptyUrlConfig() {
    when(mockUrl.getValue()).thenReturn(" ");
    HttpServiceTunnel tunnel = new HttpServiceTunnel();
    assertFalse(tunnel.isActive());
  }

  /**
   * {@link HttpServiceTunnel} should be inactive, if no url is defined.
   */
  @Test(expected = RuntimeException.class)
  public void testInvalidUrlConfig() {
    when(mockUrl.getValue()).thenReturn("asdf");
    new HttpServiceTunnel();
  }

  @Test
  public void testValidUrlConfig() {
    when(mockUrl.getValue()).thenReturn("http://localhost");
    HttpServiceTunnel tunnel = new HttpServiceTunnel();
    assertTrue(tunnel.isActive());
  }

  protected byte[] serialize(ServiceTunnelResponse response) throws IOException {
    return SerializationUtility.createObjectSerializer().serialize(response);
  }

  private BinaryServiceTunnelContentHandler getTestContentHandler() {
    return new BinaryServiceTunnelContentHandler() {

      @Override
      public void writeResponse(OutputStream out, ServiceTunnelResponse msg) {
      }

      @Override
      public void writeRequest(OutputStream out, ServiceTunnelRequest msg) {
      }

      @Override
      public ServiceTunnelResponse readResponse(InputStream in) throws IOException, ClassNotFoundException {
        return SerializationUtility.createObjectSerializer().deserialize(in, ServiceTunnelResponse.class);
      }

      @Override
      public ServiceTunnelRequest readRequest(InputStream in) {
        return null;
      }

      @Override
      public void initialize() {
      }
    };
  }
}
