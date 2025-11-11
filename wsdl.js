// wsdl.js - WSDL Definition for QuickBooks Web Connector

const wsdl = `<?xml version="1.0" encoding="utf-8"?>
<definitions xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns:tns="http://developer.intuit.com/"
             xmlns="http://schemas.xmlsoap.org/wsdl/"
             targetNamespace="http://developer.intuit.com/">
  
  <types>
    <schema xmlns="http://www.w3.org/2001/XMLSchema"
            targetNamespace="http://developer.intuit.com/">
      
      <element name="authenticate">
        <complexType>
          <sequence>
            <element name="strUserName" type="string"/>
            <element name="strPassword" type="string"/>
          </sequence>
        </complexType>
      </element>
      <element name="authenticateResponse">
        <complexType>
          <sequence>
            <element name="authenticateResult" type="tns:ArrayOfString"/>
          </sequence>
        </complexType>
      </element>
      
      <element name="clientVersion">
        <complexType>
          <sequence>
            <element name="strVersion" type="string"/>
          </sequence>
        </complexType>
      </element>
      <element name="clientVersionResponse">
        <complexType>
          <sequence>
            <element name="clientVersionResult" type="string"/>
          </sequence>
        </complexType>
      </element>
      
      <element name="sendRequestXML">
        <complexType>
          <sequence>
            <element name="ticket" type="string"/>
            <element name="strHCPResponse" type="string"/>
            <element name="strCompanyFileName" type="string"/>
            <element name="qbXMLCountry" type="string"/>
            <element name="qbXMLMajorVers" type="int"/>
            <element name="qbXMLMinorVers" type="int"/>
          </sequence>
        </complexType>
      </element>
      <element name="sendRequestXMLResponse">
        <complexType>
          <sequence>
            <element name="sendRequestXMLResult" type="string"/>
          </sequence>
        </complexType>
      </element>
      
      <element name="receiveResponseXML">
        <complexType>
          <sequence>
            <element name="ticket" type="string"/>
            <element name="response" type="string"/>
            <element name="hresult" type="string"/>
            <element name="message" type="string"/>
          </sequence>
        </complexType>
      </element>
      <element name="receiveResponseXMLResponse">
        <complexType>
          <sequence>
            <element name="receiveResponseXMLResult" type="int"/>
          </sequence>
        </complexType>
      </element>
      
      <element name="connectionError">
        <complexType>
          <sequence>
            <element name="ticket" type="string"/>
            <element name="hresult" type="string"/>
            <element name="message" type="string"/>
          </sequence>
        </complexType>
      </element>
      <element name="connectionErrorResponse">
        <complexType>
          <sequence>
            <element name="connectionErrorResult" type="string"/>
          </sequence>
        </complexType>
      </element>
      
      <element name="getLastError">
        <complexType>
          <sequence>
            <element name="ticket" type="string"/>
          </sequence>
        </complexType>
      </element>
      <element name="getLastErrorResponse">
        <complexType>
          <sequence>
            <element name="getLastErrorResult" type="string"/>
          </sequence>
        </complexType>
      </element>
      
      <element name="closeConnection">
        <complexType>
          <sequence>
            <element name="ticket" type="string"/>
          </sequence>
        </complexType>
      </element>
      <element name="closeConnectionResponse">
        <complexType>
          <sequence>
            <element name="closeConnectionResult" type="string"/>
          </sequence>
        </complexType>
      </element>
      
      <complexType name="ArrayOfString">
        <sequence>
          <element name="string" type="string" minOccurs="0" maxOccurs="unbounded"/>
        </sequence>
      </complexType>
      
    </schema>
  </types>
  
  <message name="authenticateSoapIn">
    <part name="parameters" element="tns:authenticate"/>
  </message>
  <message name="authenticateSoapOut">
    <part name="parameters" element="tns:authenticateResponse"/>
  </message>
  
  <message name="clientVersionSoapIn">
    <part name="parameters" element="tns:clientVersion"/>
  </message>
  <message name="clientVersionSoapOut">
    <part name="parameters" element="tns:clientVersionResponse"/>
  </message>
  
  <message name="sendRequestXMLSoapIn">
    <part name="parameters" element="tns:sendRequestXML"/>
  </message>
  <message name="sendRequestXMLSoapOut">
    <part name="parameters" element="tns:sendRequestXMLResponse"/>
  </message>
  
  <message name="receiveResponseXMLSoapIn">
    <part name="parameters" element="tns:receiveResponseXML"/>
  </message>
  <message name="receiveResponseXMLSoapOut">
    <part name="parameters" element="tns:receiveResponseXMLResponse"/>
  </message>
  
  <message name="connectionErrorSoapIn">
    <part name="parameters" element="tns:connectionError"/>
  </message>
  <message name="connectionErrorSoapOut">
    <part name="parameters" element="tns:connectionErrorResponse"/>
  </message>
  
  <message name="getLastErrorSoapIn">
    <part name="parameters" element="tns:getLastError"/>
  </message>
  <message name="getLastErrorSoapOut">
    <part name="parameters" element="tns:getLastErrorResponse"/>
  </message>
  
  <message name="closeConnectionSoapIn">
    <part name="parameters" element="tns:closeConnection"/>
  </message>
  <message name="closeConnectionSoapOut">
    <part name="parameters" element="tns:closeConnectionResponse"/>
  </message>
  
  <portType name="QBWebConnectorSvcSoap">
    <operation name="authenticate">
      <input message="tns:authenticateSoapIn"/>
      <output message="tns:authenticateSoapOut"/>
    </operation>
    <operation name="clientVersion">
      <input message="tns:clientVersionSoapIn"/>
      <output message="tns:clientVersionSoapOut"/>
    </operation>
    <operation name="sendRequestXML">
      <input message="tns:sendRequestXMLSoapIn"/>
      <output message="tns:sendRequestXMLSoapOut"/>
    </operation>
    <operation name="receiveResponseXML">
      <input message="tns:receiveResponseXMLSoapIn"/>
      <output message="tns:receiveResponseXMLSoapOut"/>
    </operation>
    <operation name="connectionError">
      <input message="tns:connectionErrorSoapIn"/>
      <output message="tns:connectionErrorSoapOut"/>
    </operation>
    <operation name="getLastError">
      <input message="tns:getLastErrorSoapIn"/>
      <output message="tns:getLastErrorSoapOut"/>
    </operation>
    <operation name="closeConnection">
      <input message="tns:closeConnectionSoapIn"/>
      <output message="tns:closeConnectionSoapOut"/>
    </operation>
  </portType>
  
  <binding name="QBWebConnectorSvcSoap" type="tns:QBWebConnectorSvcSoap">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="authenticate">
      <soap:operation soapAction="http://developer.intuit.com/authenticate"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="clientVersion">
      <soap:operation soapAction="http://developer.intuit.com/clientVersion"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="sendRequestXML">
      <soap:operation soapAction="http://developer.intuit.com/sendRequestXML"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="receiveResponseXML">
      <soap:operation soapAction="http://developer.intuit.com/receiveResponseXML"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="connectionError">
      <soap:operation soapAction="http://developer.intuit.com/connectionError"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="getLastError">
      <soap:operation soapAction="http://developer.intuit.com/getLastError"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="closeConnection">
      <soap:operation soapAction="http://developer.intuit.com/closeConnection"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>
  
  <service name="QBWebConnectorSvc">
    <port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap">
      <soap:address location="http://localhost:8080/wsdl"/>
    </port>
  </service>
  
</definitions>`;

module.exports = wsdl;